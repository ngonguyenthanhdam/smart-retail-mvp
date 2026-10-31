'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Banknote, CalendarDays, ChartNoAxesCombined, ChevronDown, CircleDollarSign, Clock3, MapPin, Package, RefreshCw, ShieldAlert, ShoppingBasket, SlidersHorizontal, Store, TriangleAlert, Wallet } from 'lucide-react';
import { useAuth } from './auth-provider';
import { catalogError } from './product-form';
import { RevenueChart } from './dashboard/revenue-chart';
import { displayReportDate, type Dashboard } from './dashboard/types';
import { apiRequest } from '@/lib/api';
import { allOptions } from '@/lib/catalog';
import type { Location } from '@/lib/locations';
import { localDate } from '@/lib/operations';
import { canAccessSection } from '@/lib/navigation';
import { vi, reportCopy as c } from '@/i18n/vi';
import { dashboardCopy } from '@/i18n/dashboard';
import { formatMoney, formatQuantity } from '@/lib/format';
import { profitTone } from '@/lib/presentation-status';
import { statusCopy } from '@/i18n/status';
import { StatusBadge, StatusValue } from './status-value';
import styles from './dashboard/dashboard.module.css';

const d = dashboardCopy.vi;
function shiftDate(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function DashboardLoading() {
  return <div role="status" aria-label={c.loading} className={styles.loading}>
    <span className={styles.srOnly}>{c.loading}</span>
    <div className={styles.kpis} aria-hidden="true">{[0, 1, 2, 3].map(index => <div className={styles.skeletonCard} key={index}><i /><b /><i /></div>)}</div>
    <div className={styles.skeletonChart} aria-hidden="true" />
  </div>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [initial] = useState(() => { const today = localDate(); return { from: shiftDate(today, -29), to: today, locationId: '' }; });
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [preset, setPreset] = useState('30');
  const [data, setData] = useState<Dashboard | null>(null);
  const [stores, setStores] = useState<Location[]>([]);
  const [error, setError] = useState('');
  const [storeError, setStoreError] = useState('');
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ from: filters.from, to: filters.to });
    if (admin && filters.locationId) params.set('locationId', filters.locationId);
    apiRequest<Dashboard>(`/reports/dashboard?${params}`, { signal: abort.signal }, 20000)
      .then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(reason => { if (!abort.signal.aborted) setError(catalogError(reason)); });
    return () => abort.abort();
  }, [admin, filters, retry]);

  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    allOptions<Location>('/locations', abort.signal)
      .then(values => { if (!abort.signal.aborted) setStores(values.filter(location => location.locationType === 'STORE')); })
      .catch(reason => { if (!abort.signal.aborted) setStoreError(catalogError(reason)); });
    return () => abort.abort();
  }, [admin, retry]);

  function refresh() { setError(''); setStoreError(''); setData(null); setRetry(value => value + 1); }
  const loading = !data && !error;
  const pending = draft.from !== filters.from || draft.to !== filters.to || draft.locationId !== filters.locationId;
  const scope = admin ? stores.find(store => store.id === filters.locationId)?.name ?? c.allStores : user?.location?.name;
  const metrics = data ? [
    { label: c.revenue, value: data.metrics.revenue, hint: c.revenueHint, icon: Banknote, isProfit: false },
    { label: c.grossProfit, value: data.metrics.grossProfit, hint: c.grossHint, icon: ChartNoAxesCombined, isProfit: true },
    { label: c.expenses, value: data.metrics.expenses, hint: c.expenseHint, icon: Wallet, isProfit: false },
    { label: c.operatingProfit, value: data.metrics.estimatedOperatingProfit, hint: c.operatingHint, icon: CircleDollarSign, isProfit: true },
  ] : [];

  return <div className={styles.page}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>{d.overview}</p><h1>{c.title}</h1><p className={styles.description}>{c.description}</p></div>
      <div className={styles.headingActions}>
        <button type="button" className={styles.secondaryButton} onClick={refresh} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{c.refresh}</button>
        {user && canAccessSection(user.role, 'sales') && <Link className={styles.primaryButton} href="/sales"><ShoppingBasket size={17} aria-hidden="true" />{d.sales}<ArrowUpRight size={16} aria-hidden="true" /></Link>}
      </div>
    </header>

    <section className={styles.filterPanel} aria-label={c.period}>
      <button ref={filterToggle} type="button" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls="dashboard-filter-fields" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={17} aria-hidden="true" /><span>{d.filters}</span><ChevronDown size={16} aria-hidden="true" /></button>
      <div id="dashboard-filter-fields" className={styles.filterFields} data-open={filtersOpen}>
      <form className={styles.filters} onSubmit={event => {
        event.preventDefault(); setError(''); setData(null); setFilters({ ...draft }); setFiltersOpen(false);
        if (window.matchMedia('(max-width: 639px)').matches) filterToggle.current?.focus();
      }}>
        <div className={styles.field}><label htmlFor="report-period">{c.period}</label>
          <select id="report-period" value={preset} onChange={event => {
            const value = event.target.value; setPreset(value);
            if (value !== 'custom') { const today = localDate(); setDraft({ ...draft, from: shiftDate(today, 1 - Number(value)), to: today }); }
          }}><option value="1">{c.today}</option><option value="7">{c.last7}</option><option value="30">{c.last30}</option><option value="custom">{c.custom}</option></select>
        </div>
        <div className={styles.field}><label htmlFor="report-from">{vi.operations.from}</label><input id="report-from" type="date" required value={draft.from} onChange={event => { setPreset('custom'); setDraft({ ...draft, from: event.target.value }); }} /></div>
        <div className={styles.field}><label htmlFor="report-to">{vi.operations.to}</label><input id="report-to" type="date" required min={draft.from} value={draft.to} onChange={event => { setPreset('custom'); setDraft({ ...draft, to: event.target.value }); }} /></div>
        {admin ? <div className={`${styles.field} ${styles.storeField}`}><label htmlFor="report-store">{vi.operations.location}</label><select id="report-store" value={draft.locationId} onChange={event => setDraft({ ...draft, locationId: event.target.value })}><option value="">{c.allStores}</option>{stores.map(store => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}</select></div>
          : <div className={styles.scope}><MapPin size={16} aria-hidden="true" /><span>{user?.location?.name}</span></div>}
        <button type="submit" className={styles.applyButton}>{vi.admin.applyFilters}<ArrowRight size={15} aria-hidden="true" /></button>
      </form>
      <div className={styles.filterFooter}><span><CalendarDays size={14} aria-hidden="true" />{c.rangeHint}</span>{pending && <span className={styles.pending} role="status">{d.pending}</span>}</div>
      </div>
      {storeError && <p className={styles.inlineError} role="alert">{d.storeError} {storeError} <button type="button" onClick={refresh}>{d.retry}</button></p>}
    </section>

    <div className={styles.sectionMeta}><span><span className={styles.scopeDot} aria-hidden="true" />{scope}</span><span>{displayReportDate(filters.from)} — {displayReportDate(filters.to)}</span></div>
    {error && <div className={styles.error} role="alert"><TriangleAlert size={21} aria-hidden="true" /><div><strong>{d.reportError}</strong><p>{error}</p></div><button type="button" className={styles.secondaryButton} onClick={refresh}>{d.retry}</button></div>}
    {loading && <DashboardLoading />}

    {data && <>
      <div className={styles.kpis} data-dashboard-metrics aria-label={d.periodSummary}>
        {metrics.map(({ label, value, hint, icon: Icon, isProfit }, index) => <section key={label} className={`${styles.kpi} ${index === 0 ? styles.primaryKpi : ''}`}>
          <div className={styles.kpiHeading}><h2>{label}</h2><span className={styles.kpiIcon}><Icon size={18} aria-hidden="true" /></span></div>
          <p className={isProfit ? styles[profitTone(value)] : undefined} data-status-tone={isProfit ? profitTone(value) : 'neutral'}>{formatMoney(value)}</p>
          {isProfit && <StatusBadge tone={profitTone(value)}>{Number(value) < 0 ? statusCopy.vi.negativeProfit : Number(value) > 0 ? statusCopy.vi.positiveProfit : statusCopy.vi.zeroProfit}</StatusBadge>}
          <span>{hint}</span>
        </section>)}
      </div>

      <div className={styles.overviewGrid}>
        <section className={`${styles.panel} ${styles.revenuePanel}`} aria-labelledby="revenue-title">
          <div className={styles.panelHeader}><div><h2 id="revenue-title">{c.trend}</h2><p>{d.snapshot}</p></div><span className={styles.periodBadge}>{displayReportDate(data.from)} – {displayReportDate(data.to)}</span></div>
          <dl className={styles.salesFacts}><div><dt>{c.invoices}</dt><dd>{formatQuantity(data.metrics.invoices)}</dd></div><div><dt>{c.cogs}</dt><dd>{formatMoney(data.metrics.cogs)}</dd></div></dl>
          {!data.metrics.invoices && <div className={styles.noSales}><ChartNoAxesCombined size={22} aria-hidden="true" /><div><strong>{c.noSales}</strong><p>{d.emptyHint}</p></div></div>}
          <RevenueChart key={`${data.from}:${data.to}:${data.locationId}`} trend={data.trend} />
        </section>

        <section className={`${styles.panel} ${styles.inventoryPanel}`} aria-labelledby="inventory-title">
          <div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>{c.inventory}</p><h2 id="inventory-title">{d.inventorySummary}</h2></div><Package size={20} aria-hidden="true" /></div>
          <p className={styles.inventoryDate}>{d.stockDate} {displayReportDate(data.inventory.asOf)}</p>
          <dl className={styles.alerts}>
            {[
              { label: d.lowStock, hint: d.lowStockHint, count: data.inventory.lowStockPairs, icon: TriangleAlert, tone: styles.warning },
              { label: d.expired, hint: d.expiredHint, count: data.inventory.expiredLots, icon: ShieldAlert, tone: styles.danger },
              { label: d.expiring, hint: d.expiringHint, count: data.inventory.expiringLots, icon: Clock3, tone: styles.warning },
            ].map(({ label, hint, count, icon: Icon, tone }) => <div key={label} className={count ? tone : styles.quiet}>
              <span className={styles.alertIcon}><Icon size={18} aria-hidden="true" /></span><dt>{label}<small>{hint}</small></dt><dd>{formatQuantity(count)}</dd>
            </div>)}
          </dl>
          <dl className={styles.inventoryFacts}>
            <div><dt>{c.stockValue}</dt><dd>{formatMoney(data.inventory.value)}</dd></div>
            <div><dt>{c.activeProducts}</dt><dd>{formatQuantity(data.inventory.activeProducts)}</dd></div>
            <div><dt>{c.stockQuantity}</dt><dd>{formatQuantity(data.inventory.quantity)}</dd></div>
          </dl>
          <div className={styles.inventoryFooter}><Link href="/inventory">{d.checkInventory}<ArrowRight size={16} aria-hidden="true" /></Link><p>{d.inventoryScope}</p></div>
        </section>
      </div>

      <div className={`${styles.detailGrid} ${!admin ? styles.singleDetail : ''}`}>
        <section className={styles.panel} aria-labelledby="products-title">
          <div className={styles.panelHeader}><div><h2 id="products-title">{c.top}</h2><p>{d.ranking}</p></div><Link href="/products" className={styles.textLink}>{d.products}<ArrowUpRight size={15} aria-hidden="true" /></Link></div>
          {!data.topProducts.length ? <div className={styles.empty}><Package size={28} aria-hidden="true" /><strong>{c.noSales}</strong><p>{d.emptyHint}</p></div> : <ol className={styles.products}>
            {data.topProducts.map((product, index) => <li key={product.id}><span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span><span className={styles.productIcon}><Package size={19} aria-hidden="true" /></span><div className={styles.productInfo}><h3>{product.name}</h3><p>{product.sku}</p></div><div className={styles.productQuantity}><strong>{formatQuantity(product.quantity)}</strong><span>{product.unit ?? d.unit}</span></div></li>)}
          </ol>}
        </section>

        {admin && data.storeComparison && <section className={styles.panel} aria-labelledby="stores-title">
          <div className={styles.panelHeader}><div><h2 id="stores-title">{c.stores}</h2><p>{d.storeScope}</p></div><Store size={19} aria-hidden="true" /></div>
          {!data.storeComparison.length ? <div className={styles.empty}><Store size={28} aria-hidden="true" /><strong>{c.noStores}</strong></div> : <>
            <p className={styles.tableHint}>{d.tableHint}</p>
            <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={c.stores}>
              <table className={`${styles.table} ${styles.storesTable}`}><thead><tr>{[vi.operations.location, c.revenue, c.quantity, c.grossProfit].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                <tbody>{data.storeComparison.map(store => <tr key={store.id}><th scope="row">{store.name}<span>{store.code}</span></th><td>{formatMoney(store.revenue)}</td><td>{formatQuantity(store.quantity)}</td><td><StatusValue tone={profitTone(store.grossProfit)} label={Number(store.grossProfit) < 0 ? statusCopy.vi.negativeProfit : Number(store.grossProfit) > 0 ? statusCopy.vi.positiveProfit : statusCopy.vi.zeroProfit}>{formatMoney(store.grossProfit)}</StatusValue></td></tr>)}</tbody>
              </table>
            </div>
          </>}
          <p className={styles.tableNote}>{d.storeDescription}</p>
        </section>}
      </div>
    </>}

    <nav className={styles.quickActions} aria-label={d.quickActions}><span>{d.quickActions}</span>
      {user && [
        { id: 'inventory' as const, label: d.stockAction, icon: Package },
        { id: 'forecasts' as const, label: d.forecastAction, icon: ChartNoAxesCombined },
        { id: 'alerts' as const, label: d.alertsAction, icon: TriangleAlert },
      ].filter(action => canAccessSection(user.role, action.id)).map(({ id, label, icon: Icon }) => <Link key={id} href={`/${id}`}><Icon size={16} aria-hidden="true" />{label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}
    </nav>
  </div>;
}
