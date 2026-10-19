import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { bodyObject, requiredText, uuidValue } from '../common/validation';
import { AiStorage, ML_DIRECTORY, aiError, audit, hashBytes, jsonValue, numberOption } from './ai-core';
import { DatasetsService } from './datasets.service';

type ModelMetadata = { model_version: string; algorithm: string; activation_eligible: boolean; contains_synthetic: boolean; artifact: { sha256: string }; [key: string]: unknown };
export const pythonPath = () => process.env.AI_PYTHON_EXECUTABLE || join(ML_DIRECTORY, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const modelRoot = () => process.env.AI_MODEL_ROOT || join(ML_DIRECTORY, 'models');
const allowedAlgorithms = ['SeasonalNaive','RollingMean28','LightGBM'];
const processes = new Map<string, ChildProcess>();
export async function pythonCommand(args: string[], timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath(), ['-m', 'src.ai_training', ...args], { cwd: ML_DIRECTORY, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('Python operation timed out')); }, timeout);
    child.stdout.on('data', chunk => { output += String(chunk); if (output.length > 4_000_000) child.kill(); });
    child.stderr.resume();
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0) reject(new Error('Không thực hiện được thao tác model. Kiểm tra Python, checksum và điều kiện kích hoạt.')); else resolve(output); });
  });
}
@Injectable()
export class TrainingService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly db: PrismaService, private readonly storage: AiStorage, private readonly datasets: DatasetsService) {}
  async onModuleInit() {
    const interrupted = await this.db.aiTrainingJob.findMany({ where: { status: 'RUNNING' } });
    for (const job of interrupted) if (!processes.has(job.id)) {
      await this.db.aiTrainingJob.update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: new Date(), error: 'Backend đã khởi động lại. Job cũ không tự chạy tiếp; dataset và kết quả đã ghi được giữ nguyên.' } });
      await audit(this.db, job.ownerId, 'TRAINING_INTERRUPTED', job.id);
    }
    await this.reconcileDeployments();
  }
  async onModuleDestroy() { for (const child of processes.values()) child.kill(); }
  async active() {
    try {
      const pointer = JSON.parse(await readFile(join(modelRoot(), 'active-model.json'), 'utf8')) as { model_version: string; metadata_sha256: string };
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(pointer.model_version) || pointer.model_version.includes('..')) throw new Error('Invalid pointer');
      const bytes = await readFile(join(modelRoot(), 'operational', pointer.model_version, 'metadata.json'));
      const lf = bytes.toString('utf8').replace(/\r\n/g, '\n');
      if (![hashBytes(bytes), hashBytes(lf), hashBytes(lf.replace(/\n/g, '\r\n'))].includes(pointer.metadata_sha256)) throw new Error('Metadata integrity');
      return JSON.parse(lf) as ModelMetadata;
    } catch { aiError('MODEL_UNAVAILABLE', 'Không đọc được model đang hoạt động.', 503); }
  }
  async list(user: AuthenticatedUser) {
    return { items: await this.db.aiTrainingJob.findMany({ where: user.role === 'ADMIN' ? {} : { ownerId: user.id, dataset: { locationId: user.locationId, external: false } },
      select: { id: true, datasetId: true, ownerId: true, modelVersion: true, status: true, config: true, error: true, createdAt: true, completedAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }) };
  }
  async detail(id: string, user: AuthenticatedUser) {
    const job = await this.db.aiTrainingJob.findUnique({ where: { id: uuidValue(id) } });
    if (!job) aiError('NOT_FOUND', 'Không tìm thấy lần huấn luyện.', 404);
    await this.datasets.get(job.datasetId, user);
    if (user.role !== 'ADMIN' && job.ownerId !== user.id) aiError('ACCESS_DENIED', 'Job không thuộc tài khoản.', 403);
    let progress: unknown = null;
    try { progress = JSON.parse((await this.storage.read(id, 'progress.json', 100000)).toString('utf8')); } catch { /* Worker may not have emitted its first measured stage. */ }
    return { ...job, progress };
  }
  async start(input: unknown, user: AuthenticatedUser) {
    const body = bodyObject(input, ['datasetId', 'evaluationDays', 'algorithms', 'parameters', 'confirmed']);
    const dataset = await this.datasets.get(uuidValue(body.datasetId), user);
    if (dataset.status !== 'PUBLISHED' || !dataset.snapshotHash || body.confirmed !== true) aiError('CONFLICT', 'Chọn dataset đã công bố và xác nhận bắt đầu training.', 409);
    const evaluationDays = numberOption(body.evaluationDays, 124, 30, 124, 'Số ngày đánh giá');
    if (!Number.isInteger(evaluationDays)) aiError('INVALID_FORMAT', 'Số ngày phải là số nguyên.');
    const algorithms = body.algorithms ?? allowedAlgorithms;
    if (!Array.isArray(algorithms) || algorithms.some(a => typeof a !== 'string' || !allowedAlgorithms.includes(a)) || new Set(algorithms).size !== algorithms.length || !['SeasonalNaive','RollingMean28'].every(a => algorithms.includes(a))) aiError('INVALID_FORMAT', 'Luôn giữ SeasonalNaive và RollingMean28 để so sánh; LightGBM là tùy chọn.');
    const parameters = bodyObject(body.parameters ?? {}, ['n_estimators','learning_rate','num_leaves','min_child_samples']);
    const bounds: Record<string, [number, number, number]> = { n_estimators: [200, 20, 400], learning_rate: [.05, .01, .2], num_leaves: [31, 4, 63], min_child_samples: [80, 10, 200] };
    for (const [key, [fallback, min, max]] of Object.entries(bounds)) if (parameters[key] !== undefined) {
      parameters[key] = numberOption(parameters[key], fallback, min, max, key);
      if (key !== 'learning_rate' && !Number.isInteger(parameters[key])) aiError('INVALID_FORMAT', `${key} phải là số nguyên.`);
    }
    const bytes = await this.storage.read(dataset.id, `snapshot-${dataset.revision}.csv`);
    if (hashBytes(bytes) !== dataset.snapshotHash) aiError('INVALID_FORMAT', 'Checksum dataset không khớp; training bị chặn.');
    const id = randomUUID(), version = `ai-${id}`;
    if (await this.db.aiTrainingJob.count({ where: { ownerId: user.id } }) >= 100) aiError('RESOURCE_LIMIT', 'Đã đạt 100 lần huấn luyện/tài khoản. Liên hệ quản trị viên để lưu trữ các thử nghiệm cũ.');
    const config = { snapshot: this.storage.path(dataset.id, `snapshot-${dataset.revision}.csv`), sha256: dataset.snapshotHash,
      version, source_kind: dataset.sourceKind === 'DATABASE' && !dataset.synthetic ? 'STORE_HISTORY' : 'EXTERNAL', synthetic: dataset.synthetic,
      evaluation_days: evaluationDays, algorithms, parameters, model_root: modelRoot() };
    await this.storage.write(id, 'config.json', JSON.stringify(config));
    await this.storage.write(id, 'heartbeat', String(Date.now()));
    let job;
    try {
      job = await this.db.$transaction(async tx => {
        const row = await tx.aiTrainingJob.create({ data: { id, datasetId: dataset.id, ownerId: user.id, modelVersion: version, status: 'RUNNING', config: jsonValue({ evaluationDays, algorithms, parameters, snapshotHash: dataset.snapshotHash }) } });
        await audit(tx, user.id, 'TRAINING_STARTED', id, { datasetId: dataset.id, evaluationDays, algorithms }); return row;
      });
    } catch { aiError('RESOURCE_LIMIT', 'Đang có một job huấn luyện. Chờ hoàn tất hoặc hủy job trước khi bắt đầu.', 409); }
    this.launch(id, user.id);
    return job;
  }
  private launch(id: string, ownerId: string) {
    const child = spawn(pythonPath(), ['-m', 'src.ai_training', '--config', this.storage.path(id, 'config.json')],
      { cwd: ML_DIRECTORY, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: '1', OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' } });
    processes.set(id, child);
    const heartbeat = setInterval(() => { void writeFile(this.storage.path(id, 'heartbeat'), String(Date.now())).catch(() => child.kill()); }, 3000);
    const timeout = setTimeout(() => child.kill(), 3600000);
    child.stdout.resume(); child.stderr.resume();
    let settled = false;
    const finish = async (code: number | null) => {
      if (settled) return; settled = true; clearInterval(heartbeat); clearTimeout(timeout); processes.delete(id);
      let result: unknown = null, error = 'Huấn luyện chưa hoàn tất. Kiểm tra dữ liệu, Python hoặc giới hạn thời gian một giờ.';
      try {
        if (code === 0) result = JSON.parse((await this.storage.read(id, 'result.json', 12 * 1024 * 1024)).toString('utf8'));
        else { const detail = JSON.parse((await this.storage.read(id, 'error.json', 10000)).toString('utf8')) as { message: string }; error = detail.message.slice(0, 1000); }
      } catch { /* Keep the bounded recovery message if worker output is incomplete. */ }
      const changed = await this.db.aiTrainingJob.updateMany({ where: { id, status: 'RUNNING' }, data: { status: result ? 'COMPLETED' : 'FAILED', result: result ? jsonValue(result) : undefined, error: result ? null : error, completedAt: new Date() } });
      if (changed.count) await audit(this.db, ownerId, result ? 'TRAINING_COMPLETED' : 'TRAINING_FAILED', id, { exitCode: code });
    };
    child.on('error', () => { void finish(-1).catch(() => undefined); });
    child.on('close', code => { void finish(code).catch(() => undefined); });
  }
  async cancel(id: string, user: AuthenticatedUser) {
    const job = await this.detail(id, user);
    if (job.status !== 'RUNNING') aiError('CONFLICT', 'Job đã kết thúc.', 409);
    if (!(await this.db.aiTrainingJob.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'CANCELLED', completedAt: new Date(), error: 'Người dùng đã hủy huấn luyện.' } })).count) aiError('CONFLICT', 'Job đã kết thúc trước khi hủy. Xem lại kết quả.', 409);
    processes.get(id)?.kill(); await audit(this.db, user.id, 'TRAINING_CANCELLED', id);
    return this.detail(id, user);
  }
  private async reconcileDeployments() {
    const pending = await this.db.aiDeployment.findMany({ where: { status: 'PENDING' } });
    if (!pending.length) return;
    let version: string;
    try { version = (await this.active()).model_version; } catch { return; }
    for (const deployment of pending) await this.db.aiDeployment.update({ where: { id: deployment.id }, data: { status: version === deployment.modelVersion ? 'COMPLETED' : 'FAILED' } });
  }
  async models(user: AuthenticatedUser) {
    const active = await this.active();
    const jobs = await this.db.aiTrainingJob.findMany({ where: { status: 'COMPLETED', ...(user.role === 'ADMIN' ? {} : { ownerId: user.id, dataset: { locationId: user.locationId, external: false } }) }, orderBy: { createdAt: 'desc' }, take: 30 });
    const deployments = user.role === 'ADMIN' ? await this.db.aiDeployment.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }) : [];
    // Global model metadata can contain other stores' metrics. Managers get only public identity/limits.
    return { active: user.role === 'ADMIN' ? active : { model_version: active.model_version, algorithm: active.algorithm, real_world_accuracy_verified: false, forecast_horizon_limit_days: 124 },
      candidates: jobs.map(j => ({ id: j.id, version: j.modelVersion, createdAt: j.createdAt,
        state: j.modelVersion === active.model_version ? 'ACTIVE' : deployments.some(d => d.modelVersion === j.modelVersion && d.status === 'COMPLETED') ? 'ARCHIVED' : 'CANDIDATE',
        metadata: (j.result as { metadata?: unknown } | null)?.metadata })), deployments };
  }
  async deploy(input: unknown, user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') aiError('ACCESS_DENIED', 'Chỉ ADMIN được kích hoạt hoặc rollback model toàn hệ thống.', 403);
    const body = bodyObject(input, ['version', 'expectedVersion', 'reason', 'confirmed']);
    const version = requiredText(body.version, 'Phiên bản', 80), reason = requiredText(body.reason, 'Lý do kích hoạt/rollback', 500);
    const current = await this.active();
    if (body.confirmed !== true || body.expectedVersion !== current.model_version || current.model_version === version) aiError('CONFLICT', 'Model ACTIVE đã thay đổi hoặc chưa xác nhận. Xem lại trước khi kích hoạt.', 409);
    const candidate = await this.db.aiTrainingJob.findUnique({ where: { modelVersion: version } });
    if (version !== 'm5-quantity-v2' && (!candidate || candidate.status !== 'COMPLETED')) aiError('INVALID_FORMAT', 'Chỉ chọn phiên bản đã hoàn tất đánh giá.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(version) || version.includes('..')) aiError('INVALID_FORMAT', 'Phiên bản không hợp lệ.');
    const metadata = JSON.parse(await readFile(join(modelRoot(), 'operational', version, 'metadata.json'), 'utf8')) as ModelMetadata;
    if (!metadata.activation_eligible || metadata.contains_synthetic) aiError('MODEL_NOT_VALIDATED', 'Cần dữ liệu không mô phỏng và validation/test độc lập đủ 124 ngày.');
    const modelPath = join(modelRoot(), 'operational', version, 'model.joblib');
    if ((await stat(modelPath)).size > 100 * 1024 * 1024 || hashBytes(await readFile(modelPath)) !== metadata.artifact.sha256) aiError('MODEL_UNAVAILABLE', 'Checksum model không khớp.');
    let deployment;
    try { deployment = await this.db.aiDeployment.create({ data: { actorId: user.id, previousVersion: current.model_version, modelVersion: version, status: 'PENDING', reason } }); }
    catch { aiError('CONFLICT', 'Một thao tác kích hoạt đang thực hiện. Hãy kiểm tra lịch sử trước khi thử lại.', 409); }
    try {
      await pythonCommand(['--activate', version, '--expected', current.model_version, '--model-root', modelRoot()]);
      await this.db.aiDeployment.update({ where: { id: deployment.id }, data: { status: 'COMPLETED' } });
      await audit(this.db, user.id, 'MODEL_ACTIVATED', deployment.id, { previousVersion: current.model_version, version, reason });
    } catch {
      await this.reconcileDeployments();
      aiError('DEPLOYMENT_UNCERTAIN', 'Kiểm tra model ACTIVE và lịch sử triển khai trước khi thử lại.', 409);
    }
    return this.models(user);
  }
}
