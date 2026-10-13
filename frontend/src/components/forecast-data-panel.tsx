'use client';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Download, Database, Upload } from 'lucide-react';
import Link from 'next/link';
import { apiRequest, downloadCsv } from '@/lib/api';
import type { ForecastReadiness } from '@/lib/forecasts';
import { catalogError } from './product-form';
import { localDate } from '@/lib/operations';

export function ForecastDataPanel({ data, admin, locationId, onSaved }: { data: ForecastReadiness | null; admin: boolean; locationId: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [includeSynthetic, setIncludeSynthetic] = useState(false);
  const pairs = data?.pairs.filter(pair => pair.locationId === locationId) ?? [];
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !selected.length || !locationId) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('');
    try {
      await apiRequest('/forecasts/data/coverage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId, productIds: selected, periodStart: form.get('periodStart'), periodEnd: form.get('periodEnd'), note: form.get('note') }) });
      setSuccess('Đã ghi nhận phạm vi lịch sử đầy đủ.'); setSelected([]); onSaved();
    } catch (e) { setError(catalogError(e)); } finally { setBusy(false); }
  }
  async function exportData() {
    setBusy(true); setError('');
    const params = new URLSearchParams(); if (locationId) params.set('locationId', locationId); if (includeSynthetic) params.set('includeSynthetic', 'true');
    try { await downloadCsv(`/forecasts/data/export?${params}`, `lich-su-ban-hang-${data?.origin ?? localDate()}.csv`); }
    catch (e) { setError(catalogError(e)); } finally { setBusy(false); }
  }
  return <details className="admin-card forecast-data-panel"><summary><span><Database size={18} /> Dữ liệu dùng để dự báo</span><span>{data ? `${data.eligibleCount}/${data.pairs.length} mặt hàng đủ lịch sử` : 'Đang kiểm tra…'}</span></summary><div className="data-panel-content">
    <p>Cần ít nhất 30 ngày liên tục đã xác nhận đầy đủ. Ngày không có giao dịch chỉ được tính là bán 0 khi nằm trong khoảng đã xác nhận.</p>
    {!!data?.pairs.length && <div className="coverage-list">{data.pairs.map(pair => <div key={`${pair.locationId}/${pair.productId}`}><span><strong>{pair.product}</strong><small>{pair.store}</small></span><span className={`record-status ${data.skipped.some(s => s.locationId === pair.locationId && s.productId === pair.productId) ? 'is-inactive' : 'is-active'}`}>{data.skipped.some(s => s.locationId === pair.locationId && s.productId === pair.productId) ? 'Cần kiểm tra lịch sử' : 'Đủ lịch sử'}</span></div>)}</div>}
    {admin && <><Link href="/imports" className="secondary-button"><Upload size={16} /> Nhập lịch sử bán hàng</Link><details className="coverage-editor"><summary>Xác nhận lịch sử đã nhập đầy đủ</summary>
      {!locationId ? <p>Chọn một cửa hàng ở phía trên để xác nhận lịch sử.</p> : <form onSubmit={confirm}><p>Chỉ xác nhận sau khi đối chiếu đủ giao dịch và các ngày không bán. Thao tác này không tạo thêm giao dịch bán hàng.</p><div className="coverage-products">{pairs.map(pair => <label key={pair.productId}><input type="checkbox" disabled={busy} checked={selected.includes(pair.productId)} onChange={e => setSelected(previous => e.target.checked ? [...previous, pair.productId] : previous.filter(id => id !== pair.productId))} />{pair.product} <small>({pair.unit})</small></label>)}</div><div className="admin-form-grid"><div className="form-field"><label htmlFor="coverage-start">Từ ngày</label><input id="coverage-start" name="periodStart" type="date" max={localDate()} required disabled={busy} /></div><div className="form-field"><label htmlFor="coverage-end">Đến ngày (trước hôm nay)</label><input id="coverage-end" name="periodEnd" type="date" max={localDate()} required disabled={busy} /></div><div className="form-field admin-span-full"><label htmlFor="coverage-note">Căn cứ xác nhận</label><textarea id="coverage-note" name="note" required maxLength={500} placeholder="Ví dụ: đã đối chiếu sổ bán hàng, gồm cả ngày đóng cửa và ngày bán 0." disabled={busy} /></div></div><label className="inventory-checkbox"><input type="checkbox" required disabled={busy} />Tôi xác nhận lịch sử của các mặt hàng đã chọn đầy đủ trong khoảng này.</label><button className="primary-button" disabled={busy || !selected.length}><CheckCircle2 size={17} />{busy ? 'Đang lưu…' : 'Lưu xác nhận'}</button></form>}
    </details><div className="training-export"><div><strong>Xuất dữ liệu để huấn luyện phiên bản mới</strong><p>Dữ liệu mô phỏng được loại khỏi tập huấn luyện mặc định. Xuất tệp không tự huấn luyện hoặc thay mô hình đang dùng.</p><label className="inventory-checkbox"><input type="checkbox" checked={includeSynthetic} onChange={e => setIncludeSynthetic(e.target.checked)} disabled={busy} />Bao gồm dữ liệu mô phỏng để thử luồng</label></div><button className="secondary-button" disabled={busy} onClick={() => void exportData()}><Download size={16} /> Tải CSV</button></div></>}
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}
  </div></details>;
}
