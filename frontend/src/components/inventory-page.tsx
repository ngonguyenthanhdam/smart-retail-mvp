'use client';
import { FilterPanel } from './filter-panel';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { InventoryLotsDialog } from '@/components/inventory-lots-dialog';
import { apiRequest } from '@/lib/api';
import {
  catalogError,
  allOptions,
  type InventoryPage as InventoryData,
  type InventoryRow,
  type Product,
} from '@/lib/catalog';
import type { Location } from '@/lib/locations';
import { vi } from '@/i18n/vi';
import { StatusBadge, StatusValue } from './status-value';
import { expiryTone, stockTone } from '@/lib/presentation-status';
import { formatMoney, formatQuantity } from '@/lib/format';
import { statusCopy } from '@/i18n/status';
const c = vi.catalog;
const a = vi.admin;
const i = vi.inventory;
const s = statusCopy.vi;
function StockQuantity({ row }: { row: InventoryRow }) {
  const tone = stockTone(row.currentQuantity, row.lowStock, row.minStockLevel !== null);
  const amount = Number(row.currentQuantity);
  const label =
    amount < 0
      ? s.stockNegative
      : amount === 0
        ? s.stockEmpty
        : row.lowStock
          ? s.stockLow
          : tone === 'success'
            ? s.stockHealthy
            : s.stockPhysical;
  return (
    <StatusValue tone={tone} label={label}>
      {formatQuantity(row.currentQuantity)} {row.baseUnitCode}
    </StatusValue>
  );
}
export function InventoryPage() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [query, setQuery] = useState({
    locationId: '',
    productId: '',
    categoryId: '',
    lowStock: 'false',
    search: '',
    page: 1,
  });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<InventoryData | null>(null);
  const [options, setOptions] = useState<{ locations: Location[]; products: Product[] } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<InventoryRow | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      admin ? allOptions<Location>('/locations', abort.signal) : Promise.resolve([]),
      allOptions<Product>('/products', abort.signal),
    ])
      .then(([locations, products]) => {
        if (!abort.signal.aborted) setOptions({ locations, products });
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [admin, revision]);
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ ...query, page: String(query.page) });
    if (!admin) params.delete('locationId');
    apiRequest<InventoryData>(`/inventory?${params}`, { signal: abort.signal })
      .then((r) => {
        if (!abort.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [query, admin, revision]);
  const categories = [
    ...new Map(
      options?.products.flatMap((p) => (p.category ? [[p.category.id, p.category] as const] : [])),
    ).values(),
  ];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>{i.title}</h1>
          <p className="page-description">{i.description}</p>
        </div>
      </div>
      {error && (
        <div role="alert" className="form-error admin-notice">
          {error}{' '}
          <button
            className="text-button"
            onClick={() => {
              setError('');
              setData(null);
              setRevision(revision + 1);
            }}
          >
            {a.retry}
          </button>
        </div>
      )}
      <section className="admin-card" aria-label={i.title}>
        <FilterPanel>
          <form
            className="admin-filters"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const v = (key: string) => String(f.get(key) ?? '');
              setData(null);
              setError('');
              setQuery({
                locationId: v('locationId'),
                productId: v('productId'),
                categoryId: v('categoryId'),
                search: v('search'),
                lowStock: f.has('lowStock') ? 'true' : 'false',
                page: 1,
              });
            }}
          >
            {admin ? (
              <div className="form-field">
                <label htmlFor="inventory-location">{i.location}</label>
                <select id="inventory-location" name="locationId">
                  <option value="">{i.allLocations}</option>
                  {options?.locations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} · {row.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p>{user?.location?.name}</p>
            )}
            <div className="form-field">
              <label htmlFor="inventory-product">{c.product}</label>
              <select id="inventory-product" name="productId">
                <option value="">{i.allProducts}</option>
                {options?.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="inventory-category">{c.category}</label>
              <select id="inventory-category" name="categoryId">
                <option value="">{c.allCategories}</option>
                {categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="inventory-search">{a.search}</label>
              <input id="inventory-search" name="search" type="search" maxLength={150} />
            </div>
            <label className="inventory-checkbox">
              <input type="checkbox" name="lowStock" />
              {i.lowStock}
            </label>
            <button className="secondary-button">{a.applyFilters}</button>
          </form>
        </FilterPanel>
        {!data && !error && (
          <p className="admin-loading" role="status">
            {c.loading}
          </p>
        )}
        {data?.items.length === 0 && (
          <div className="empty-state">
            <h2>{c.empty}</h2>
            <p>{c.emptyHint}</p>
          </div>
        )}
        {!!data?.items.length && (
          <>
            <dl className="page-stat-strip" aria-label={s.currentPage}>
              <div>
                <dt>{s.currentPage}</dt>
                <dd>
                  {formatQuantity(data.items.length)} <small>{s.rows}</small>
                </dd>
              </div>
              <div>
                <dt>{s.stockAttention}</dt>
                <dd
                  className={
                    data.items.some((row) => row.lowStock || Number(row.currentQuantity) <= 0)
                      ? 'semantic-warning'
                      : ''
                  }
                >
                  {formatQuantity(
                    data.items.filter((row) => row.lowStock || Number(row.currentQuantity) <= 0)
                      .length,
                  )}
                </dd>
              </div>
            </dl>
            <p className="table-scroll-hint">{s.tableHint}</p>
            <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={i.title}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{c.product}</th>
                    <th>{i.location}</th>
                    <th className="numeric-cell">{i.quantity}</th>
                    <th className="numeric-cell">{c.sellingPrice}</th>
                    <th className="numeric-cell">{c.safetyStock}</th>
                    <th className="numeric-cell">{c.minStock}</th>
                    <th>{i.earliestExpiry}</th>
                    <th>{i.expiry}</th>
                    <th>{a.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={`${row.locationId}-${row.productId}`}>
                      <th scope="row">
                        {row.productName}
                        <span className="admin-cell-note">
                          {row.sku} · {row.categoryName}
                        </span>
                      </th>
                      <td>
                        {row.locationName}
                        <span className="admin-cell-note">{row.locationCode}</span>
                      </td>
                      <td className="numeric-cell">
                        <StockQuantity row={row} />
                      </td>
                      <td className="numeric-cell">
                        {row.sellingPrice === null ? a.noValue : formatMoney(row.sellingPrice)}
                      </td>
                      <td className="numeric-cell">
                        {row.safetyStock === null ? a.noValue : formatQuantity(row.safetyStock)}
                      </td>
                      <td className="numeric-cell">
                        {row.minStockLevel === null ? a.noValue : formatQuantity(row.minStockLevel)}
                      </td>
                      <td>{row.trackExpiry ? (row.earliestExpiry ?? a.noValue) : a.noValue}</td>
                      <td>
                        <StatusBadge tone={expiryTone(row.expiryStatus)}>
                          {i.statuses[row.expiryStatus]}
                        </StatusBadge>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          aria-label={`${i.lots}: ${row.productName} · ${row.locationName}`}
                          onClick={() => setSelected(row)}
                        >
                          {i.lots}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {data && (
          <div className="admin-pagination">
            <p>{a.pagination(data.page, pages, data.total)}</p>
            <div>
              <button
                className="secondary-button"
                disabled={query.page <= 1}
                onClick={() => {
                  setData(null);
                  setQuery({ ...query, page: query.page - 1 });
                }}
              >
                {a.previous}
              </button>
              <button
                className="secondary-button"
                disabled={query.page >= pages}
                onClick={() => {
                  setData(null);
                  setQuery({ ...query, page: query.page + 1 });
                }}
              >
                {a.next}
              </button>
            </div>
          </div>
        )}
      </section>
      <p className="field-hint">
        {s.stockLegend} {i.physicalHint}
      </p>
      {data && (
        <p className="field-hint">{i.expiryHint(data.expiryWarningDays, data.businessDate)}</p>
      )}
      {selected && <InventoryLotsDialog row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
