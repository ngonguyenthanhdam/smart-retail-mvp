'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { AdminDialog } from '@/components/admin-dialog';
import type { CurrentUser } from '@/lib/auth';
import type { Dataset, Job, Models } from './types';
import {
  aiGet,
  aiPost,
  Badge,
  DataTable,
  dateText,
  ErrorBox,
  messageOf,
  numberText,
  Section,
} from './shared';

import { ResultDashboard } from './result-dashboard';
import { WorkflowStepper } from './workflow-stepper';

const stages = [
  ['DATA_COLLECTION', 'Thu thập dữ liệu'],
  ['EDA', 'Khám phá & kiểm tra'],
  ['FEATURES', 'Tạo đặc trưng'],
  ['SPLITTING', 'Chia theo thời gian'],
  ['TRAINING', 'Huấn luyện'],
  ['EVALUATION', 'Đánh giá'],
  ['COMPLETED', 'Lưu ứng viên'],
];
export function TrainingPanel({ user, dataset }: { user: CurrentUser; dataset: Dataset | null }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [models, setModels] = useState<Models | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [lightgbm, setLightgbm] = useState(true);
  const [trees, setTrees] = useState(200);
  const [rate, setRate] = useState(0.05);
  const [leaves, setLeaves] = useState(31);
  const [version, setVersion] = useState('');
  const [reason, setReason] = useState('');
  const [deploying, setDeploying] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([
      aiGet<{ items: Job[] }>('/training'),
      aiGet<Models>('/models'),
    ]);
    setJobs(a.items);
    setModels(b);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([aiGet<{ items: Job[] }>('/training'), aiGet<Models>('/models')])
      .then(([a, b]) => {
        if (!cancelled) {
          setJobs(a.items);
          setModels(b);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const jobId = job?.id;
  const running = job?.status === 'RUNNING';
  useEffect(() => {
    if (!jobId || !running) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void aiGet<Job>(`/training/${jobId}`)
        .then((data) => {
          if (!cancelled) {
            setJob(data);
            if (data.status !== 'RUNNING') void refresh().catch((e) => setError(messageOf(e)));
          }
        })
        .catch((e) => {
          if (!cancelled) setError(messageOf(e));
        });
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, running, refresh]);
  async function action(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const result = job?.result;
  const availableDays = dataset?.summary?.minimumTrainingDays ?? 0;
  const validParameters =
    !lightgbm ||
    (Number.isInteger(trees) &&
      trees >= 20 &&
      trees <= 400 &&
      Number.isFinite(rate) &&
      rate >= 0.01 &&
      rate <= 0.2 &&
      Number.isInteger(leaves) &&
      leaves >= 4 &&
      leaves <= 63);
  const blocked = !dataset
    ? 'Chọn dataset ở khu vực Dữ liệu huấn luyện trước.'
    : dataset.status !== 'PUBLISHED'
      ? 'Dataset chưa được công bố. Quay lại Dữ liệu huấn luyện, bấm Xác nhận sử dụng dữ liệu.'
      : dataset.summary?.missingDays
        ? 'Dữ liệu còn ngày chưa biết. Bổ sung lịch sử và công bố dataset mới trước khi chạy.'
        : availableDays < 60 + 2 * days
          ? `Dataset có ${availableDays} ngày cho chuỗi ngắn nhất; chế độ này cần ${60 + 2 * days} ngày. ${availableDays >= 120 ? 'Chọn chế độ 30 ngày để thử với bộ dữ liệu này.' : 'Bổ sung ít nhất 120 ngày liên tục để chạy chế độ 30 ngày.'}`
          : !validParameters
            ? 'Kiểm tra lại tham số trong Tùy chọn nâng cao.'
            : '';
  const versions = [
    ...new Set([
      'm5-quantity-v2',
      ...(models?.candidates
        .filter((c) => c.metadata?.activation_eligible && !c.metadata.contains_synthetic)
        .map((c) => c.version) ?? []),
    ]),
  ].filter((v) => v !== models?.active.model_version);
  return (
    <Section title="Huấn luyện & kết quả">
      <WorkflowStepper
        dataset={dataset}
        job={job}
        models={models}
        insufficient={
          !!dataset &&
          dataset.status === 'PUBLISHED' &&
          (!!dataset.summary?.missingDays || availableDays < 60 + 2 * days)
        }
      />
      {models && (
        <div className="ai-active-summary">
          <span className="ai-dot ready" />
          <span>Đang vận hành</span>
          <strong>{models.active.algorithm}</strong>
          <code>{models.active.model_version}</code>
        </div>
      )}
      <details className="ai-run-config" open={!result}>
        <summary>
          Cấu hình lần huấn luyện <span>{dataset?.name ?? 'Chưa chọn dataset'}</span>
        </summary>
        <div className="ai-training-start">
          <div className="ai-dataset-label">
            <span>Dataset đang chọn</span>
            <h3>{dataset?.name ?? 'Chưa chọn dataset'}</h3>
            {dataset && (
              <p>
                <Badge status={dataset.status} /> · {numberText(dataset.summary?.salesRows)} dòng ·{' '}
                {numberText(dataset.summary?.series)} chuỗi · {availableDays} ngày/chuỗi
              </p>
            )}
          </div>
          <div className="ai-fields">
            <label className="form-field">
              Cách đánh giá
              <select
                aria-label="Cách đánh giá"
                value={days}
                disabled={busy || running}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={30}>Thử nghiệm · 30 ngày (khuyên dùng cho dữ liệu mẫu)</option>
                <option value={124}>
                  Đánh giá dài hạn · 124 ngày (cần ít nhất 308 ngày dữ liệu)
                </option>
              </select>
              <span className="field-hint">
                Số ngày của mỗi giai đoạn kiểm tra độ chính xác; không phải thời gian chờ huấn
                luyện.
              </span>
            </label>
            <label className="form-field">
              Mô hình so sánh
              <select
                aria-label="Mô hình so sánh"
                value={lightgbm ? 'lightgbm' : 'baselines'}
                disabled={busy || running}
                onChange={(e) => setLightgbm(e.target.value === 'lightgbm')}
              >
                <option value="lightgbm">LightGBM + hai phương pháp cơ sở</option>
                <option value="baselines">Chỉ hai phương pháp cơ sở (chạy nhanh)</option>
              </select>
              <span className="field-hint">
                So sánh với cùng ngày tuần trước và trung bình 28 ngày gần nhất.
              </span>
            </label>
          </div>
          <details className="ai-advanced">
            <summary>Tùy chọn nâng cao — có thể giữ nguyên mặc định</summary>
            <p>
              LightGBM học từ lịch sử bán để dự báo. Các tham số dưới đây điều khiển cách học; không
              cần chỉnh để chạy thử.
            </p>
            <div className="ai-fields">
              <label className="form-field">
                Số cây
                <input
                  type="number"
                  min={20}
                  max={400}
                  disabled={!lightgbm || busy || running}
                  value={trees}
                  onChange={(e) => setTrees(Number(e.target.value))}
                />
                <span className="field-hint">
                  Số bước xây mô hình. Nhiều cây thường chạy lâu hơn; mặc định 200.
                </span>
              </label>
              <label className="form-field">
                Tốc độ học (learning rate)
                <input
                  type="number"
                  min={0.01}
                  max={0.2}
                  step={0.01}
                  disabled={!lightgbm || busy || running}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                />
                <span className="field-hint">Mức điều chỉnh ở mỗi bước học. Mặc định 0,05.</span>
              </label>
              <label className="form-field">
                Số lá tối đa
                <input
                  type="number"
                  min={4}
                  max={63}
                  disabled={!lightgbm || busy || running}
                  value={leaves}
                  onChange={(e) => setLeaves(Number(e.target.value))}
                />
                <span className="field-hint">
                  Độ phức tạp mỗi cây. Mặc định 31; quá lớn dễ học theo nhiễu.
                </span>
              </label>
            </div>
          </details>
          {blocked && (
            <div className="ai-notice" role="status">
              {blocked}
              {days === 124 && availableDays >= 120 && availableDays < 308 && (
                <button className="ai-link" type="button" onClick={() => setDays(30)}>
                  Dùng chế độ 30 ngày
                </button>
              )}
            </div>
          )}
          <div className="ai-start-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy || running || !!blocked}
              onClick={() =>
                void action(async () => {
                  setJob(
                    await aiPost<Job>('/training', {
                      datasetId: dataset!.id,
                      evaluationDays: days,
                      algorithms: [
                        'SeasonalNaive',
                        'RollingMean28',
                        ...(lightgbm ? ['LightGBM'] : []),
                      ],
                      parameters: { n_estimators: trees, learning_rate: rate, num_leaves: leaves },
                      confirmed: true,
                    }),
                  );
                  await refresh();
                })
              }
            >
              <Play size={17} />
              {running ? 'Đang huấn luyện…' : 'Bắt đầu huấn luyện'}
            </button>
            <p className="field-hint">
              Kết quả được lưu thành phiên bản để xem xét; model đang vận hành giữ nguyên.
            </p>
            {running && (
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Dừng lần huấn luyện này? Dataset vẫn được giữ lại.'))
                    void action(async () =>
                      setJob(await aiPost<Job>(`/training/${job!.id}/cancel`)),
                    );
                }}
              >
                Hủy lần chạy
              </button>
            )}
          </div>
        </div>
      </details>
      <ErrorBox error={error} />
      <div className="ai-fields">
        <label className="form-field">
          Xem lần huấn luyện
          <select
            aria-label="Lần huấn luyện"
            value={job?.id ?? ''}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value)
                void action(async () => setJob(await aiGet<Job>(`/training/${e.target.value}`)));
              else setJob(null);
            }}
          >
            <option value="">Chưa chọn kết quả</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {dateText(j.createdAt)} · {j.status} · {j.modelVersion.slice(0, 11)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void action(refresh)}
        >
          <RefreshCw size={16} />
          Làm mới kết quả
        </button>
      </div>
      {job && (
        <div className="ai-job" aria-live="polite">
          <Badge status={job.status} />
          <strong>{stages.find(([s]) => s === job.progress?.stage)?.[1] ?? 'Chuẩn bị'}</strong>
          {job.error && <ErrorBox error={job.error} />}
          <details>
            <summary>Xem tiến trình chi tiết</summary>
            <code>{job.modelVersion}</code>
            {job.progress?.events.map((event, i) => (
              <p key={i}>
                {dateText(event.at)} · {stages.find(([s]) => s === event.stage)?.[1] ?? event.stage}
              </p>
            ))}
          </details>
        </div>
      )}
      {result ? (
        <ResultDashboard key={job!.id} result={result} />
      ) : (
        <div className="ai-results-empty">
          <h3>{running ? 'Đang tạo kết quả từ dataset của bạn' : 'Chưa có kết quả được chọn'}</h3>
          <p>
            {running
              ? 'Có thể tiếp tục trò chuyện trong khi chờ.'
              : 'Bắt đầu huấn luyện hoặc chọn một lần chạy đã lưu.'}
          </p>
        </div>
      )}
      {models && (
        <details className="ai-registry">
          <summary>Model đang sử dụng & quản lý phiên bản</summary>
          <div className="ai-active">
            <Badge status="ACTIVE" />
            <strong>{models.active.model_version}</strong>
            <span>{models.active.algorithm}</span>
          </div>
          <p className="field-hint">
            Chỉ phiên bản đủ điều kiện mới được kích hoạt. Dữ liệu mô phỏng không chứng minh độ
            chính xác tại cửa hàng thực tế.
          </p>
          <DataTable
            rows={models.candidates.map((c) => ({
              'Phiên bản': c.version,
              Model: c.metadata?.algorithm,
              'Trạng thái': c.state,
              'Có thể kích hoạt':
                c.metadata?.activation_eligible && !c.metadata.contains_synthetic ? 'Có' : 'Không',
              'Tạo lúc': dateText(c.createdAt),
            }))}
          />
          {user.role === 'ADMIN' ? (
            <div className="ai-confirm">
              <div className="ai-fields">
                <label className="form-field">
                  Chuyển sang phiên bản
                  <select value={version} onChange={(e) => setVersion(e.target.value)}>
                    <option value="">Chọn phiên bản đã đủ điều kiện</option>
                    {versions.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Lý do chuyển đổi
                  <input
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={busy || !version || !reason.trim()}
                onClick={() => setDeploying(true)}
              >
                Kích hoạt phiên bản
              </button>
              <details>
                <summary>Lịch sử chuyển đổi</summary>
                <DataTable
                  rows={models.deployments.map((d) => ({
                    Từ: d.previousVersion,
                    Sang: d.modelVersion,
                    'Trạng thái': d.status,
                    'Lý do': d.reason,
                    'Thời điểm': dateText(d.createdAt),
                  }))}
                />
              </details>
            </div>
          ) : (
            <p className="field-hint">Chỉ ADMIN được thay đổi model vận hành.</p>
          )}
        </details>
      )}
      {deploying && models && (
        <AdminDialog titleId="activate-model-title" busy={busy} onClose={() => setDeploying(false)}>
          <h2 id="activate-model-title">Kích hoạt phiên bản {version}?</h2>
          <p>
            Thay {models.active.model_version} bằng {version} cho những lần dự báo tiếp theo trên
            toàn hệ thống. Các dự báo đã lưu giữ nguyên.
          </p>
          <p>Lý do: {reason}</p>
          <ErrorBox error={error} />
          <div className="admin-form-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setDeploying(false)}
            >
              Quay lại
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setModels(
                    await aiPost<Models>('/models/activate', {
                      version,
                      expectedVersion: models.active.model_version,
                      reason,
                      confirmed: true,
                    }),
                  );
                  setVersion('');
                  setReason('');
                  setDeploying(false);
                })
              }
            >
              Xác nhận kích hoạt
            </button>
          </div>
        </AdminDialog>
      )}
    </Section>
  );
}
