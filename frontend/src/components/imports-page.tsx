'use client';
import { catalogError } from '@/lib/catalog';
import { useEffect, useRef, useState } from 'react';
import { FileUp, CheckCircle2, Trash2 } from 'lucide-react';
import { AdminDialog } from './admin-dialog';
import { apiRequest } from '@/lib/api';
import Link from 'next/link';
import { translateMessage } from '@/lib/error-copy';
import type { Page } from '@/lib/catalog';
import { displayDate } from '@/lib/operations';
import { vi, importCopy as c } from '@/i18n/vi';
import { StatusValue } from './status-value';
import { formatQuantity } from '@/lib/format';
type ImportType = keyof typeof c.types;
type Definitions = {
  types: Record<ImportType, { columns: string[]; required: string[]; instructions: string }>;
};
type Job = {
  id: string;
  importType: ImportType;
  fileName: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  errorReport: { row: number; error: string }[] | null;
  columns?: string[];
  validRows?: number;
  invalidRows?: number;
  previewAvailable?: boolean;
  previewToken?: string;
  sampleRows?: { row: number; values: Record<string, string>; valid: boolean }[];
};
type Pick = { key: string; file: File; type: ImportType | 'AUTO'; job?: Job; error?: string };
const statusText = (job: Job) =>
  job.status === 'FAILED' && job.errorReport?.some((e) => e.error === 'Cancelled before importing.')
    ? 'Đã hủy'
    : ({
        PENDING: 'Chờ nhập',
        PROCESSING: 'Đang nhập',
        COMPLETED: 'Đã nhập',
        PARTIAL: 'Nhập một phần',
        FAILED: 'Thất bại',
      }[job.status] ?? job.status);
const errorText = (message: string) =>
  message === 'Cancelled before importing.'
    ? 'Đã hủy trước khi ghi dữ liệu.'
    : translateMessage(message.replace(/^Entire (invoice|purchase order|order) rejected: /, ''));
const help: Record<ImportType, string> = {
  PRODUCT:
    'Cần có danh mục và đơn vị tính trước. Chỉ thêm sản phẩm mới; không ghi đè SKU đã tồn tại.',
  SALE: 'Cần có cửa hàng và sản phẩm trước. Giá vốn là tổng cho cả dòng. Nhập lịch sử không trừ tồn kho.',
  INVENTORY:
    'Cần có cửa hàng, sản phẩm đang hoạt động. Chỉ nhận cặp cửa hàng × sản phẩm chưa có lô tồn.',
  PURCHASE:
    'Cần có địa điểm và sản phẩm trước. Chỉ nhận lịch sử RECEIVED hoặc CANCELLED; không chạy nhận hàng.',
  EXPENSE:
    'Mã địa điểm phải tồn tại; để trống nếu là chi phí chung. Không nhập lại khoản chi đã nhập thành công.',
};
function Errors({ errors }: { errors: NonNullable<Job['errorReport']> }) {
  const [page, setPage] = useState(0);
  const count = Math.ceil(errors.length / 10);
  const current = Math.min(page, count - 1);
  return (
    <div className="import-errors">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Dòng CSV</th>
              <th>Lỗi cần sửa</th>
            </tr>
          </thead>
          <tbody>
            {errors.slice(current * 10, current * 10 + 10).map((e, i) => (
              <tr key={i}>
                <td>{e.row || '—'}</td>
                <td>{errorText(e.error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > 1 && (
        <div className="import-pagination">
          <span>
            {current + 1}/{count} · {errors.length} dòng lỗi
          </span>
          <button
            className="text-button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Trước
          </button>
          <button
            className="text-button"
            disabled={current + 1 === count}
            onClick={() => setPage(current + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
export function ImportsPage() {
  const [type, setType] = useState<ImportType | 'AUTO'>('AUTO');
  const [definitions, setDefinitions] = useState<Definitions | null>(null);
  const [history, setHistory] = useState<Page<Job> | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [progress, setProgress] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      apiRequest<Definitions>('/imports/templates', { signal: abort.signal }),
      apiRequest<Page<Job>>(`/imports?page=${page}`, { signal: abort.signal }),
    ])
      .then(([defs, jobs]) => {
        if (!abort.signal.aborted) {
          setDefinitions(defs);
          setHistory(jobs);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [page, revision]);
  function refresh() {
    setRevision((n) => n + 1);
  }
  function receive(job: Job) {
    setPicks((items) =>
      items.map((p) => (p.job?.id === job.id ? { ...p, job, error: undefined } : p)),
    );
    setDetail(job);
  }
  async function act(fn: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(catalogError(e));
    } finally {
      locked.current = false;
      setBusy(false);
      setProgress('');
    }
  }
  function choose(files: FileList | null) {
    if (!files) return;
    setError('');
    setNotice('');
    const incoming = Array.from(files);
    if (
      picks.length + incoming.length > 20 ||
      incoming.some((f) => !/\.(csv|xlsx)$/i.test(f.name) || f.size > 2 * 1024 * 1024 || !f.size)
    ) {
      setError('Chọn tối đa 20 tệp CSV/XLSX, mỗi tệp có dữ liệu và không quá 2 MB.');
      return;
    }
    setPicks((previous) => [
      ...previous,
      ...incoming.map((file) => ({ key: crypto.randomUUID(), file, type })),
    ]);
  }
  async function preview(pick: Pick) {
    const form = new FormData();
    form.set('importType', pick.type);
    form.set('file', pick.file);
    const job = await apiRequest<Job>('/imports/preview', { method: 'POST', body: form }, 45000);
    setPicks((items) =>
      items.map((p) => (p.key === pick.key ? { ...p, job, error: undefined } : p)),
    );
    return job;
  }
  async function validatePicks() {
    await act(async () => {
      const targets = picks.filter((p) => !p.job);
      let succeeded = 0;
      for (const [i, pick] of targets.entries()) {
        setProgress(`Đang kiểm tra ${i + 1}/${targets.length}: ${pick.file.name}`);
        try {
          const job = await preview(pick);
          succeeded++;
          if (targets.length === 1) {
            setDetail(job);
            setUncertain(false);
          }
        } catch (e) {
          setPicks((items) =>
            items.map((p) => (p.key === pick.key ? { ...p, error: catalogError(e) } : p)),
          );
        }
      }
      setNotice(
        `Đã kiểm tra ${succeeded}/${targets.length} tệp. Mở từng kết quả để xem lỗi hoặc nhập dữ liệu. Chưa ghi dữ liệu nghiệp vụ.`,
      );
      refresh();
    });
  }
  async function open(id: string) {
    await act(async () => {
      setUncertain(false);
      let job = await apiRequest<Job>(`/imports/${id}`);
      if (job.status === 'PENDING' && job.previewAvailable)
        job = await apiRequest<Job>(`/imports/${id}/revalidate`, { method: 'POST' }, 45000);
      receive(job);
    });
  }
  async function transition(action: 'confirm' | 'cancel' | 'revalidate') {
    if (!detail) return;
    await act(async () => {
      try {
        const job = await apiRequest<Job>(
          `/imports/${detail.id}/${action}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action === 'confirm' ? { previewToken: detail.previewToken } : {}),
          },
          75000,
        );
        receive(job);
        setUncertain(false);
        refresh();
        setNotice(
          action === 'confirm'
            ? `Đã nhập ${job.successRows} dòng từ ${job.fileName}; ${job.failedRows} dòng bị từ chối.`
            : action === 'cancel'
              ? `Đã hủy ${job.fileName}. Chưa ghi dữ liệu nghiệp vụ.`
              : 'Đã kiểm tra lại với danh mục hiện tại.',
        );
      } catch (e) {
        setUncertain(true);
        refresh();
        throw e;
      }
    });
  }
  async function dismiss(job: Job) {
    await act(async () => {
      await apiRequest(`/imports/${job.id}`, { method: 'DELETE' });
      setDetail(null);
      setPicks((items) => items.filter((p) => p.job?.id !== job.id));
      setNotice('Đã xóa lần nhập khỏi danh sách. Thông tin đối chiếu vẫn được lưu.');
      refresh();
    });
  }
  function download() {
    if (!definitions || type === 'AUTO') return;
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + definitions.types[type].columns.join(',') + '\r\n'], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type.toLowerCase()}-template.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const pages = Math.max(1, Math.ceil((history?.total ?? 0) / 20));
  const blocked =
    detail?.status === 'PENDING'
      ? !detail.previewAvailable
        ? c.expired
        : !detail.validRows
          ? 'Chưa thể nhập: không có dòng hợp lệ. Xem lỗi bên dưới, bổ sung danh mục/cửa hàng/sản phẩm còn thiếu rồi bấm Kiểm tra lại.'
          : uncertain
            ? c.uncertain
            : ''
      : '';
  return (
    <div className="page-content import-page">
      <div className="page-heading">
        <div>
          <h1>{c.title}</h1>
          <p className="page-description">Chọn tệp → kiểm tra → xem kết quả → nhập dữ liệu.</p>
        </div>
      </div>
      {notice && (
        <p className="form-success import-feedback" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </p>
      )}
      {!detail && error && (
        <p className="form-error import-feedback" role="alert">
          {error}
        </p>
      )}
      <section className="admin-card import-upload">
        <h2>1. Chọn dữ liệu cần nhập</h2>
        <p>
          CSV nghiệp vụ trong <strong>datasets/chatbot-business</strong> dùng ở trang này. CSV trong{' '}
          <strong>datasets/ai-center</strong> dùng tại{' '}
          <Link className="text-button" href="/ai-center">
            AI Center
          </Link>
          .
        </p>
        <div className="admin-filters">
          <div className="form-field">
            <label htmlFor="import-type">Nhận diện loại dữ liệu</label>
            <select
              id="import-type"
              value={type}
              disabled={busy}
              onChange={(e) => setType(e.target.value as ImportType | 'AUTO')}
            >
              <option value="AUTO">Tự nhận diện theo cột (khuyên dùng)</option>
              {Object.entries(c.types).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="import-file">Chọn một hoặc nhiều tệp</label>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx"
              multiple
              disabled={busy}
              onChange={(e) => {
                choose(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <p>
          Tối đa 20 tệp/lần chọn · mỗi tệp 2 MB, 1.000 dòng · XLSX một trang tính. Chọn tệp chưa
          thay đổi dữ liệu.
        </p>
        <details className="import-help">
          <summary>Mẫu CSV và những dữ liệu cần có trước</summary>
          <p>
            Tạo cửa hàng tại{' '}
            <Link className="text-button" href="/stores">
              Cửa hàng
            </Link>
            , danh mục tại{' '}
            <Link className="text-button" href="/products/categories">
              Danh mục
            </Link>{' '}
            và đơn vị tại{' '}
            <Link className="text-button" href="/products/units">
              Đơn vị
            </Link>
            . Sau đó nhập sản phẩm trước lịch sử bán/tồn kho.
          </p>
          {Object.entries(help).map(([key, text]) => (
            <p key={key}>
              <strong>{c.types[key as ImportType]}:</strong> {text}
            </p>
          ))}
          {type !== 'AUTO' && definitions ? (
            <>
              <p>Cột bắt buộc: {definitions.types[type].required.join(', ')}</p>
              <button type="button" className="secondary-button" onClick={download}>
                Tải mẫu CSV
              </button>
            </>
          ) : (
            <p>Chọn một loại cụ thể phía trên để tải mẫu của loại đó.</p>
          )}
        </details>
        {!!picks.length && (
          <div className="import-picked">
            <h3>2. Tệp đã chọn ({picks.length})</h3>
            {picks.map((p) => (
              <article className="import-pick" key={p.key}>
                <div>
                  <strong>{p.file.name}</strong>
                  <p>
                    {(p.file.size / 1024).toFixed(1)} KB ·{' '}
                    {p.job
                      ? `${c.types[p.job.importType]} · ${statusText(p.job)}`
                      : 'Chưa kiểm tra'}
                    {p.job?.status === 'PENDING'
                      ? ` · ${p.job.validRows ?? 0} hợp lệ / ${p.job.invalidRows ?? 0} lỗi`
                      : ''}
                  </p>
                  {p.error && <p className="form-error">{p.error}</p>}
                </div>
                <div className="import-pick-actions">
                  {!p.job && (
                    <>
                      <select
                        aria-label={`Loại dữ liệu ${p.file.name}`}
                        disabled={busy}
                        value={p.type}
                        onChange={(e) =>
                          setPicks((items) =>
                            items.map((item) =>
                              item.key === p.key
                                ? {
                                    ...item,
                                    type: e.target.value as Pick['type'],
                                    error: undefined,
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="AUTO">Tự nhận diện</option>
                        {Object.entries(c.types).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setPicks((items) => items.filter((item) => item.key !== p.key))
                        }
                      >
                        Bỏ tệp
                      </button>
                    </>
                  )}
                  {p.job && (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void open(p.job!.id)}
                    >
                      Xem kết quả / nhập
                    </button>
                  )}
                </div>
              </article>
            ))}
            <div className="import-toolbar">
              <button
                className="primary-button"
                disabled={busy || !definitions || !picks.some((p) => !p.job)}
                onClick={() => void validatePicks()}
              >
                <FileUp size={17} />
                {busy ? 'Đang xử lý…' : 'Kiểm tra và xem trước'}
              </button>
              <span role="status">
                {progress || 'Mỗi tệp có kết quả riêng; tệp hợp lệ được giữ khi tệp khác có lỗi.'}
              </span>
            </div>
          </div>
        )}
      </section>
      <section className="admin-card">
        <div className="report-section-heading">
          <h2>Lịch sử và kết quả nhập</h2>
          <button className="secondary-button" disabled={busy} onClick={refresh}>
            Làm mới
          </button>
        </div>
        {!history && !error && (
          <p role="status" className="admin-loading">
            {c.loading}
          </p>
        )}
        {history?.total === 0 && <p className="admin-loading">{c.empty}</p>}
        {!!history?.items.length && (
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.history}>
            <table className="admin-table">
              <thead>
                <tr>
                  {[c.fileName, c.type, c.status, 'Kết quả', c.created, vi.admin.actions].map(
                    (s) => (
                      <th key={s}>{s}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {history.items.map((job) => (
                  <tr key={job.id}>
                    <th scope="row">{job.fileName}</th>
                    <td>{c.types[job.importType]}</td>
                    <td>{statusText(job)}</td>
                    <td>
                      {job.status === 'PENDING'
                        ? `${job.totalRows} dòng chờ kiểm tra/nhập`
                        : `${job.successRows} đã nhập · ${job.failedRows} lỗi`}
                    </td>
                    <td>{displayDate(job.createdAt)}</td>
                    <td>
                      <div className="import-pick-actions">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void open(job.id)}
                        >
                          Xem kết quả
                        </button>
                        {job.status === 'FAILED' && !job.successRows && (
                          <button
                            className="text-button import-delete"
                            disabled={busy}
                            onClick={() => void dismiss(job)}
                          >
                            <Trash2 size={14} />
                            Xóa khỏi danh sách
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history && (
          <div className="admin-pagination">
            <p>{vi.admin.pagination(page, pages, history.total)}</p>
            <div>
              <button
                className="secondary-button"
                disabled={page === 1 || busy}
                onClick={() => setPage(page - 1)}
              >
                {vi.admin.previous}
              </button>
              <button
                className="secondary-button"
                disabled={page >= pages || busy}
                onClick={() => setPage(page + 1)}
              >
                {vi.admin.next}
              </button>
            </div>
          </div>
        )}
      </section>
      {detail && (
        <AdminDialog
          titleId="import-review-title"
          busy={busy}
          onClose={() => {
            setDetail(null);
            setError('');
          }}
        >
          <div className="operation-dialog">
            <h2 id="import-review-title">{c.review}</h2>
            <p>
              <strong>{detail.fileName}</strong> · {c.types[detail.importType]} ·{' '}
              {statusText(detail)}
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="import-counts">
              <p>
                Tổng dòng <strong>{formatQuantity(detail.totalRows)}</strong>
              </p>
              {detail.status === 'PENDING' ? (
                <>
                  <StatusValue tone={detail.validRows ? 'success' : 'neutral'} label="Dòng hợp lệ">
                    {detail.validRows == null ? '—' : formatQuantity(detail.validRows)}
                  </StatusValue>
                  <StatusValue tone={detail.invalidRows ? 'danger' : 'neutral'} label="Dòng có lỗi">
                    {detail.invalidRows == null ? '—' : formatQuantity(detail.invalidRows)}
                  </StatusValue>
                </>
              ) : (
                <>
                  <StatusValue
                    tone={detail.successRows ? 'success' : 'neutral'}
                    label="Dòng đã nhập"
                  >
                    {formatQuantity(detail.successRows)}
                  </StatusValue>
                  <StatusValue
                    tone={detail.failedRows ? 'danger' : 'neutral'}
                    label="Dòng bị từ chối"
                  >
                    {formatQuantity(detail.failedRows)}
                  </StatusValue>
                </>
              )}
            </div>
            {blocked && (
              <p className="import-blocked" role="status">
                {blocked}
              </p>
            )}
            {detail.status === 'PENDING' && (
              <p>
                {help[detail.importType]} {c.confirmHint}
              </p>
            )}
            {detail.status === 'PENDING' && !detail.validRows && (
              <p className="import-reference-links">
                Bổ sung tại:{' '}
                <Link href="/stores" target="_blank" rel="noreferrer">
                  Cửa hàng
                </Link>{' '}
                ·{' '}
                <Link href="/products/categories" target="_blank" rel="noreferrer">
                  Danh mục
                </Link>{' '}
                ·{' '}
                <Link href="/products/units" target="_blank" rel="noreferrer">
                  Đơn vị
                </Link>{' '}
                ·{' '}
                <Link href="/products" target="_blank" rel="noreferrer">
                  Sản phẩm
                </Link>
                . Sau khi lưu, quay lại và kiểm tra lại tệp này.
              </p>
            )}
            {!!detail.errorReport?.length && (
              <Errors key={detail.id + detail.previewToken} errors={detail.errorReport} />
            )}
            {detail.sampleRows && (
              <details className="import-help">
                <summary>Xem trước dữ liệu (tối đa 20 dòng)</summary>
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        {detail.columns?.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.sampleRows.map((row) => (
                        <tr key={row.row} className={row.valid ? '' : 'import-invalid'}>
                          <th scope="row">{row.row}</th>
                          {detail.columns?.map((column) => (
                            <td key={column}>{row.values[column] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <div className="admin-form-actions import-review-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setDetail(null);
                  setError('');
                }}
              >
                Đóng
              </button>
              {detail.status === 'PENDING' && (
                <>
                  <button
                    className="text-button"
                    disabled={busy || uncertain}
                    onClick={() => void transition('cancel')}
                  >
                    Hủy nhập
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy || !detail.previewAvailable}
                    onClick={() => void transition('revalidate')}
                  >
                    Kiểm tra lại
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy || uncertain || !detail.previewAvailable || !detail.validRows}
                    onClick={() => void transition('confirm')}
                  >
                    {busy ? 'Đang xử lý…' : 'Nhập các dòng hợp lệ'}
                  </button>
                </>
              )}
              {detail.status === 'FAILED' && !detail.successRows && (
                <button
                  className="text-button import-delete"
                  disabled={busy}
                  onClick={() => void dismiss(detail)}
                >
                  Xóa khỏi danh sách
                </button>
              )}
              {uncertain && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void open(detail.id)}
                >
                  Làm mới kết quả
                </button>
              )}
            </div>
          </div>
        </AdminDialog>
      )}
    </div>
  );
}
