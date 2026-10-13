'use client';
import { useState } from 'react';
import { History, ShoppingBasket, CheckCircle2 } from 'lucide-react';
import { OperationList } from './operation-list';
import { SaleDetail } from './sale-detail';
import { SaleForm } from './sale-form';
import { catalogError } from './product-form';
import { apiRequest } from '@/lib/api';
import { displayDate, type Sale, type SaleDetail as Detail } from '@/lib/operations';
import { formatMoney } from '@/lib/format';
import { vi } from '@/i18n/vi';
const o = vi.operations; const a = vi.admin;
export function SalesPage() {
  const [mode, setMode] = useState<'pos' | 'history'>('pos'); const [revision, setRevision] = useState(0);
  const [success, setSuccess] = useState(false); const [detail, setDetail] = useState<Detail | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function open(id: string) { setBusy(true); setError(''); try { setDetail(await apiRequest<Detail>(`/sales/${id}`)); } catch (e) { setError(catalogError(e)); } finally { setBusy(false); } }
  return <div className="page-content sales-workspace"><div className="page-heading"><div><p className="eyebrow">MỖI GIAO DỊCH, MỘT KHÁCH HÀNG</p><h1>Bán hàng</h1><p className="page-description">Chọn hàng, kiểm tra giỏ và hoàn tất giao dịch.</p></div><div className="segmented-control" aria-label="Chế độ bán hàng"><button aria-pressed={mode === 'pos'} onClick={() => { setMode('pos'); setError(''); }}><ShoppingBasket size={17} /> Quầy bán hàng</button><button aria-pressed={mode === 'history'} onClick={() => { setMode('history'); setError(''); }}><History size={17} /> Lịch sử</button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success sale-success" role="status"><CheckCircle2 size={18} />{o.saleSaved}<button className="text-button" onClick={() => setSuccess(false)}>Đóng</button></p>}
    <div hidden={mode !== 'pos'}><SaleForm key={revision} onClose={() => setMode('history')} onSaved={sale => { setDetail(sale); setSuccess(true); setRevision(value => value + 1); }} /></div>
    {mode === 'history' && <OperationList<Sale> path="/sales" title="Lịch sử bán hàng" description="Tra cứu hóa đơn đã ghi nhận tại cửa hàng." revision={revision} createLabel={o.newSale} onCreate={() => setMode('pos')} statuses={['COMPLETED', 'VOIDED']} columns={[o.invoiceNumber, o.location, o.soldAt, a.status, o.total, a.actions]} row={sale => <><th scope="row" className="operation-number">{sale.invoiceNumber}</th><td>{sale.location?.name ?? a.noValue}</td><td>{displayDate(sale.soldAt)}</td><td><span className="record-status is-active">{o.status[sale.status]}</span></td><td>{formatMoney(sale.totalAmount)}</td><td><button className="text-button" disabled={busy} onClick={() => void open(sale.id)}>{o.view}</button></td></>} />}
    {detail && <SaleDetail record={detail} onClose={() => setDetail(null)} />}
  </div>;
}
