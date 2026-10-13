"use client";
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Banknote, ChartNoAxesCombined, CircleDollarSign, Package, RefreshCw, ShoppingBasket, TriangleAlert, Wallet } from 'lucide-react';
import { useAuth } from './auth-provider';
import { ProductImage } from './product-image';
import { catalogError } from './product-form';
import { apiRequest } from '@/lib/api';
import { allOptions } from '@/lib/catalog';
import type { Location } from '@/lib/locations';
import { localDate } from '@/lib/operations';
import { vi, reportCopy as c } from '@/i18n/vi';
import { formatMoney, formatQuantity } from '@/lib/format';

type Dashboard = {
  from: string; to: string; locationId: string | null;
  metrics: { revenue: string; cogs: string; expenses: string; grossProfit: string; estimatedOperatingProfit: string; invoices: number; quantity: string };
  trend: { date: string; revenue: string }[];
  topProducts: { id: string; sku: string; name: string; quantity: string; unit: string | null }[];
  storeComparison?: { id: string; code: string; name: string; revenue: string; quantity: string; grossProfit: string }[];
  inventory: { asOf: string; quantity: string; value: string; activeProducts: number; lowStockPairs: number; expiredLots: number; expiringLots: number };
};
const shiftDate = (date: string, days: number) => { const result = new Date(`${date}T00:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0,10); };
function display(value: string | number, money = false) {
  return money ? formatMoney(value) : formatQuantity(value);
}
function RevenueChart({ trend }: { trend: Dashboard['trend'] }) {
  const max = Math.max(1, ...trend.map((day) => Number(day.revenue)));
  const points = trend.map((day, index) => `${48 + index * 680 / Math.max(1,trend.length - 1)},${220 - Number(day.revenue) / max * 175}`).join(' ');
  return <><svg className="revenue-chart" viewBox="0 0 760 260" role="img" aria-label={c.trend}>
    <title>{c.trend}</title>{[0,0.5,1].map((ratio) => <g key={ratio}><line x1="48" x2="728" y1={220 - ratio * 175} y2={220 - ratio * 175} stroke="#e1e7e3" /><text x="45" y={224 - ratio * 175} textAnchor="end" fontSize="10" fill="#67746f">{new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(max * ratio)}</text></g>)}
    <polyline fill="none" stroke="#17604f" strokeWidth="3" points={points} />
    {trend.length === 1 && <circle cx="48" cy={220 - Number(trend[0].revenue) / max * 175} r="4" fill="#17604f" />}
    <text x="48" y="245" fontSize="11" fill="#67746f">{trend[0]?.date}</text><text x="728" y="245" textAnchor="end" fontSize="11" fill="#67746f">{trend.length > 1 ? trend[trend.length-1].date : ''}</text>
  </svg><details className="report-daily"><summary>{c.trendData}</summary><div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.trendData}><table className="admin-table"><thead><tr><th>{c.date}</th><th>{c.revenue}</th></tr></thead><tbody>{trend.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{display(day.revenue,true)}</td></tr>)}</tbody></table></div></details></>;
}
export function DashboardPage() {
  const { user } = useAuth(); const admin = user?.role === 'ADMIN';
  const [initial] = useState(() => { const today = localDate(); return { from: shiftDate(today,-29), to: today, locationId: '' }; });
  const [draft, setDraft] = useState(initial); const [filters, setFilters] = useState(initial); const [preset, setPreset] = useState('30');
  const [data, setData] = useState<Dashboard | null>(null); const [stores, setStores] = useState<Location[]>([]); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); const params = new URLSearchParams({ from: filters.from, to: filters.to });
    if (admin && filters.locationId) params.set('locationId',filters.locationId);
    apiRequest<Dashboard>(`/reports/dashboard?${params}`, { signal: abort.signal }, 20000).then((value) => { if (!abort.signal.aborted) setData(value); }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    if (admin) allOptions<Location>('/locations',abort.signal).then((values) => { if (!abort.signal.aborted) setStores(values.filter((l) => l.locationType === 'STORE')); }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [admin, filters, retry]);
  function refresh() { setError(''); setData(null); setRetry(retry+1); }
  return <div className="page-content report-page"><div className="page-heading"><div><p className="eyebrow">KHÔNG GIAN KINH DOANH CỦA BẠN</p><h1>{c.title}</h1><p className="page-description">{c.description}</p></div><button className="secondary-button" onClick={refresh}><RefreshCw size={16} />{c.refresh}</button></div>
    <section className="dashboard-hero"><div className="dashboard-hero-copy"><span className="hero-tag"><span /> Mỗi ngày, hiểu cửa hàng hơn</span><h2>Hàng hóa rõ ràng.<br />Quyết định chủ động.</h2><p>Từ giao dịch hôm nay đến lượng hàng cần chuẩn bị cho ngày tới — mọi thứ trong một không gian.</p><Link href="/forecasts" className="hero-link">Khám phá dự báo bán hàng <ArrowRight size={18} /></Link></div><div className="dashboard-hero-image"><Image src="/assets/retail-hero.webp" alt="Minh họa không gian cửa hàng thực phẩm xanh, gọn gàng" fill sizes="(max-width: 720px) 100vw, 40vw" priority /></div></section>
    <nav className="dashboard-shortcuts" aria-label="Thao tác nhanh"><Link href="/sales"><span className="shortcut-icon"><ShoppingBasket size={22} /></span><span><strong>Bán hàng tại quầy</strong><small>Tạo giao dịch và cập nhật tồn kho</small></span><ArrowUpRight size={18} /></Link><Link href="/inventory"><span className="shortcut-icon warm"><Package size={22} /></span><span><strong>Kiểm tra hàng hóa</strong><small>Xem số lượng và hạn sử dụng</small></span><ArrowUpRight size={18} /></Link><Link href="/alerts"><span className="shortcut-icon rose"><TriangleAlert size={22} /></span><span><strong>Việc cần chú ý</strong><small>{data ? `${data.inventory.lowStockPairs} mặt hàng tồn thấp` : 'Theo dõi cảnh báo tồn kho'}</small></span><ArrowUpRight size={18} /></Link></nav>
    <section className="admin-card"><form className="admin-filters" onSubmit={(e) => { e.preventDefault(); setError(''); setData(null); setFilters({ ...draft }); }}>
      <div className="form-field"><label htmlFor="report-period">{c.period}</label><select id="report-period" value={preset} onChange={(e) => { const value = e.target.value; setPreset(value); if (value !== 'custom') { const today = localDate(); setDraft({ ...draft, from: shiftDate(today,1-Number(value)), to: today }); } }}><option value="1">{c.today}</option><option value="7">{c.last7}</option><option value="30">{c.last30}</option><option value="custom">{c.custom}</option></select></div>
      <div className="form-field"><label htmlFor="report-from">{vi.operations.from}</label><input id="report-from" type="date" required value={draft.from} onChange={(e) => { setPreset('custom'); setDraft({ ...draft, from: e.target.value }); }} /></div>
      <div className="form-field"><label htmlFor="report-to">{vi.operations.to}</label><input id="report-to" type="date" required min={draft.from} value={draft.to} onChange={(e) => { setPreset('custom'); setDraft({ ...draft, to: e.target.value }); }} /></div>
      {admin ? <div className="form-field"><label htmlFor="report-store">{vi.operations.location}</label><select id="report-store" value={draft.locationId} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}><option value="">{c.allStores}</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}</select></div> : <p>{user?.location?.name}</p>}
      <button className="primary-button">{vi.admin.applyFilters}</button><p className="report-filter-hint">{c.rangeHint}</p>
    </form></section>
    {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={refresh}>{vi.admin.retry}</button></p>}
    {!data && !error && <p role="status" className="admin-loading">{c.loading}</p>}
    {data && <><div className="report-kpis">{[
      [c.revenue,data.metrics.revenue,c.revenueHint], [c.grossProfit,data.metrics.grossProfit,c.grossHint],
      [c.expenses,data.metrics.expenses,c.expenseHint], [c.operatingProfit,data.metrics.estimatedOperatingProfit,c.operatingHint],
    ].map(([label,value,hint], index) => { const Icon = [Banknote, ChartNoAxesCombined, Wallet, CircleDollarSign][index]; return <section className={`report-kpi kpi-${index}`} key={label}><div className="kpi-label"><h2>{label}</h2><span><Icon size={20} /></span></div><p className={value.startsWith('-') ? 'report-negative' : ''}>{display(value,true)}</p><span>{hint}</span></section>; })}</div>
      <p className="report-context">{data.from} — {data.to} · {c.invoices}: {data.metrics.invoices} · {c.cogs}: {display(data.metrics.cogs,true)}</p>
      <section className="admin-card report-chart-card"><div className="report-section-heading"><h2>{c.trend}</h2></div>{!data.metrics.invoices && <p className="report-empty">{c.noSales}</p>}<RevenueChart trend={data.trend} /></section>
      <section className="admin-card"><div className="report-section-heading"><h2>{c.top}</h2><Link href="/products" className="text-button">Xem danh mục <ArrowRight size={15} /></Link></div>{!data.topProducts.length ? <p className="report-empty">{c.noSales}</p> : <div className="top-product-list">{data.topProducts.map((p, index) => <article key={p.id}><span className="product-rank">{String(index + 1).padStart(2, '0')}</span><ProductImage name={p.name} /><div><h3>{p.name}</h3><p>{p.sku}</p></div><strong>{display(p.quantity)} <small>{p.unit ?? 'đơn vị'}</small></strong></article>)}</div>}</section>
      {admin && data.storeComparison && <section className="admin-card"><div className="report-section-heading"><div><h2>{c.stores}</h2><p className="page-description">{c.storesHint}</p></div></div>{!data.storeComparison.length ? <p className="report-empty">{c.noStores}</p> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.stores}><table className="admin-table"><thead><tr>{[vi.operations.location,c.revenue,c.quantity,c.grossProfit].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.storeComparison.map((s) => <tr key={s.id}><th scope="row">{s.name}<span className="admin-cell-note">{s.code}</span></th><td>{display(s.revenue,true)}</td><td>{display(s.quantity)}</td><td>{display(s.grossProfit,true)}</td></tr>)}</tbody></table></div>}</section>}
      <section className="admin-card"><div className="report-section-heading"><div><h2>{c.inventory}</h2><p className="page-description">{c.inventoryHint}</p><p className="page-description">{c.asOf}: {data.inventory.asOf}</p></div></div><dl className="report-inventory">{[
        [c.stockQuantity,display(data.inventory.quantity)], [c.activeProducts,data.inventory.activeProducts], [c.lowStock,data.inventory.lowStockPairs],
        [c.expired,data.inventory.expiredLots], [c.expiring,data.inventory.expiringLots], [c.stockValue,display(data.inventory.value,true)],
      ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
    </>}
  </div>;
}
