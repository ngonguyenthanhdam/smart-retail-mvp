'use client';
import { useState, type ReactNode } from 'react';
import { apiRequest } from '@/lib/api';
export const aiGet = <T,>(path: string) => apiRequest<T>('/ai-center' + path, undefined, 30000);
export const aiPost = <T,>(path: string, data: unknown = {}) => apiRequest<T>('/ai-center' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }, 190000);
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Không thực hiện được yêu cầu. Hãy thử lại.';
export const numberText = (n: unknown) => typeof n === 'number' ? n.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : n === null || n === undefined ? '—' : String(n);
export const dateText = (s: string) => new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const statusNames: Record<string,string> = { VALID: 'Hợp lệ', STAGING: 'Đang chuẩn bị', PUBLISHED: 'Đã công bố', EXPIRED: 'Hết hạn', INVALID_FORMAT: 'Sai định dạng', MISSING_REQUIRED_FIELDS: 'Thiếu dữ liệu bắt buộc', NEEDS_MAPPING: 'Cần ánh xạ cột', UNSUPPORTED_DATASET: 'Dữ liệu chưa hỗ trợ', DUPLICATE_DATA: 'Dữ liệu trùng', ACCESS_DENIED: 'Ngoài phạm vi', RUNNING: 'Đang chạy', COMPLETED: 'Hoàn tất', FAILED: 'Thất bại', CANCELLED: 'Đã hủy', CANDIDATE: 'Ứng viên', ACTIVE: 'Đang hoạt động', ARCHIVED: 'Đã lưu trữ' };
export function Badge({ status }: { status: string }) { return <span className={`ai-badge ai-badge-${status.toLowerCase()}`} title={status}>{statusNames[status] ?? status}</span>; }
export function ErrorBox({ error }: { error: string }) { return error ? <p className="form-error" role="alert">{error}</p> : null; }
export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) { return <section className="ai-section"><div className="ai-section-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</section>; }
export function DataTable({ rows }: { rows: Record<string,unknown>[] }) {
  const [page, setPage] = useState(0), lastPage = Math.max(0, Math.ceil(rows.length / 50) - 1), currentPage = Math.min(page, lastPage);
  if (!rows.length) return <p className="field-hint">Chưa có bản ghi phù hợp.</p>;
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return <><div className="admin-table-scroll"><table className="admin-table ai-table"><thead><tr>{keys.map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.slice(currentPage * 50, (currentPage + 1) * 50).map((row, i) => <tr key={i}>{keys.map(key => <td key={key}>{typeof row[key] === 'object' && row[key] !== null ? JSON.stringify(row[key]) : numberText(row[key])}</td>)}</tr>)}</tbody></table></div>{rows.length > 50 && <div className="ai-row"><span className="field-hint">Dòng {currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, rows.length)} / {numberText(rows.length)}</span><button className="ai-link" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trang trước</button><button className="ai-link" type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Trang sau</button></div>}</>;
}
export function LineChart({ title, labels, series }: { title: string; labels: string[]; series: { name: string; values: number[]; color: string }[] }) {
  if (!labels.length) return null;
  const values = series.flatMap(s => s.values).filter(Number.isFinite), min = Math.min(0, ...values), max = Math.max(1, ...values), span = max - min || 1;
  return <figure className="ai-chart"><figcaption>{title}</figcaption><svg viewBox="0 0 640 200" role="img" aria-label={title}><line x1="50" y1="165" x2="620" y2="165" stroke="#ccd8d2" /><text x="4" y="22">{numberText(max)}</text><text x="4" y="164">{numberText(min)}</text>{series.map(s => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.5" points={s.values.map((n,i) => `${50 + i / Math.max(1, labels.length - 1) * 570},${160 - (n - min) / span * 140}`).join(' ')} />)}<text x="50" y="190">{labels[0]}</text><text x="620" y="190" textAnchor="end">{labels.at(-1)}</text></svg><div className="ai-row">{series.map(s => <span key={s.name} style={{ color: s.color }}>● {s.name}</span>)}</div><details><summary>Xem số liệu biểu đồ</summary><DataTable rows={labels.map((label, i) => Object.fromEntries([['Ngày / khoảng', label], ...series.map(s => [s.name, s.values[i]])]))} /></details></figure>;
}
