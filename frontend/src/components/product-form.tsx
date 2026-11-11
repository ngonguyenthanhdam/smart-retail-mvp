'use client';
import { Feedback } from '@/i18n/feedback';
import { useMessages } from '@/i18n/provider';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminDialog } from '@/components/admin-dialog';
import { ProductImage, productIllustrations } from '@/components/product-image';
import type { Location } from '@/lib/locations';
import { apiRequest } from '@/lib/api';
import {
  allOptions,
  catalogError,
  saveRecord,
  remainingStock,
  type RemainingStock,
  type Category,
  type Product,
  type Unit,
} from '@/lib/catalog';

export function ProductForm({
  id,
  onClose,
  onSaved,
}: {
  id?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { c, a } = usePageCopy();
  const [options, setOptions] = useState<{
    categories: Category[];
    units: Unit[];
    record: Product | null;
    stores: Location[];
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<object | null>(null);
  const [revision, setRevision] = useState(0);
  const [allStores, setAllStores] = useState(false);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [assignmentChanged, setAssignmentChanged] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [imagePath, setImagePath] = useState('');
  const [imageKey, setImageKey] = useState('');
  const [stock, setStock] = useState<RemainingStock[]>([]);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (error) feedbackRef.current?.focus(); }, [error]);
  useEffect(() => { if (pending) confirmationRef.current?.focus(); }, [pending]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      allOptions<Category>('/categories', abort.signal),
      allOptions<Unit>('/units', abort.signal),
      id ? apiRequest<Product>(`/products/${id}`, { signal: abort.signal }) : Promise.resolve(null),
      allOptions<Location>('/locations?type=STORE&status=active', abort.signal),
    ])
      .then(([categories, units, record, stores]) => {
        if (!abort.signal.aborted) {
          setOptions({ categories, units, record, stores });
          setAllStores(record?.isGlobalAllStores ?? false);
          setStoreIds(record?.storeProducts?.filter((s) => s.isActive && stores.some((l) => l.id === s.locationId)).map((s) => s.locationId) ?? []);
          setImagePath(record?.imagePath ?? '');
          setImageKey(record?.imageKey ?? '');
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [id, revision]);
  async function save(values: object) {
    setBusy(true);
    setError('');
    try {
      if (file) {
        const form = new FormData();
        form.set('data', JSON.stringify(values));
        form.set('image', file);
        await apiRequest(`/products${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: form }, 30000);
      } else await saveRecord('/products', values, id);
      onSaved();
    } catch (e) {
      const remaining = remainingStock(e);
      if (remaining) { setPending(values); setStock(remaining); }
      else setError(catalogError(e));
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const v = (key: string) => String(f.get(key) ?? '').trim();
    const values = {
      sku: v('sku'),
      name: v('name'),
      barcode: v('barcode') || null,
      categoryId: v('categoryId'),
      baseUnitId: v('baseUnitId'),
      purchaseUnitId: v('purchaseUnitId'),
      purchaseToBaseRatio: v('purchaseToBaseRatio'),
      defaultCost: v('defaultCost'),
      trackExpiry: v('trackExpiry') === 'true',
      shelfLifeDays: v('shelfLifeDays') === '' ? null : Number(v('shelfLifeDays')),
      isActive: v('isActive') === 'true',
      ...(v('defaultSellingPrice') ? { defaultSellingPrice: v('defaultSellingPrice') } : {}),
      defaultMinStockLevel: v('defaultMinStockLevel'),
      defaultSafetyStock: v('defaultSafetyStock'),
      ...(imagePath !== (options?.record?.imagePath ?? '') ? { imagePath: imagePath || null } : {}),
      ...(imageKey !== (options?.record?.imageKey ?? '') ? { imageKey: imageKey || null } : {}),
      ...((!id || assignmentChanged) && v('isActive') === 'true' ? {
        isGlobalAllStores: allStores,
        ...(!allStores ? { storeIds } : {}),
        applyDefaultsToExisting: f.get('applyDefaults') === 'on',
      } : {}),
    };
    void save(values);
  }
  const record = options?.record;
  const ready = options && options.categories.length > 0 && options.units.length > 0;
  return (
    <AdminDialog titleId="product-title" busy={busy} onClose={onClose}>
      <h2 id="product-title" ref={confirmationRef} tabIndex={-1}>
        {pending ? c.reviewAssignments : id ? c.editProduct : c.addProduct}
      </h2>
      {error && (
        <p className="form-error" role="alert" ref={feedbackRef} tabIndex={-1}>
          {<Feedback text={error} />}
        </p>
      )}
      {!options && (
        <p className="admin-loading">
          {error ? (
            <button
              className="text-button"
              onClick={() => {
                setError('');
                setRevision(revision + 1);
              }}
            >
              {a.retry}
            </button>
          ) : (
            c.loading
          )}
        </p>
      )}
      {options && !ready && <p>{c.prerequisites}</p>}
      {options && (
        <form className="admin-form" onSubmit={submit}>
          <fieldset className="admin-fieldset" disabled={busy || !ready} hidden={!!pending}>
            <div className="admin-form-grid">
              <div className="form-field">
                <label htmlFor="product-sku">{c.sku}</label>
                <input
                  id="product-sku"
                  name="sku"
                  required
                  maxLength={50}
                  defaultValue={record?.sku}
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label htmlFor="product-barcode">
                  {c.barcode} {a.optional}
                </label>
                <input
                  id="product-barcode"
                  name="barcode"
                  maxLength={100}
                  defaultValue={record?.barcode ?? ''}
                />
              </div>
              <div className="form-field admin-span-full">
                <label htmlFor="product-name">{c.name}</label>
                <input
                  id="product-name"
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={record?.name}
                />
              </div>
              <div className="form-field">
                <label htmlFor="product-category">{c.category}</label>
                <select
                  id="product-category"
                  name="categoryId"
                  required
                  defaultValue={record?.categoryId ?? ''}
                >
                  <option value="">{c.choose}</option>
                  {options.categories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {row.isActive ? '' : ` (${a.inactive})`}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ['baseUnitId', c.baseUnit],
                  ['purchaseUnitId', c.purchaseUnit],
                ] as const
              ).map(([field, label]) => (
                <div className="form-field" key={field}>
                  <label htmlFor={`product-${field}`}>{label}</label>
                  <select
                    id={`product-${field}`}
                    name={field}
                    required
                    defaultValue={record?.[field] ?? ''}
                  >
                    <option value="">{c.choose}</option>
                    {options.units.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} · {row.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="form-field">
                <label htmlFor="product-ratio">{c.ratio}</label>
                <input
                  id="product-ratio"
                  name="purchaseToBaseRatio"
                  type="number"
                  min="0.0001"
                  max="9999999999.9999"
                  step="0.0001"
                  required
                  defaultValue={record?.purchaseToBaseRatio ?? '1'}
                />
                <p className="field-hint">{c.ratioHint}</p>
              </div>
              <div className="form-field">
                <label htmlFor="product-cost">{c.cost} (VND)</label>
                <input
                  id="product-cost"
                  name="defaultCost"
                  type="number"
                  min="0"
                  max="999999999999.99"
                  step="0.01"
                  required
                  defaultValue={record?.defaultCost ?? '0'}
                />
              </div>
              <div className="form-field">
                <label htmlFor="product-expiry">{c.trackExpiry}</label>
                <select
                  id="product-expiry"
                  name="trackExpiry"
                  defaultValue={String(!!record?.trackExpiry)}
                >
                  <option value="false">{c.no}</option>
                  <option value="true">{c.yes}</option>
                </select>
              </div>
              {([
                ['defaultSellingPrice', c.defaultSellingPrice, '0.01'],
                ['defaultMinStockLevel', c.defaultMinStock, '0.0001'],
                ['defaultSafetyStock', c.defaultSafetyStock, '0.0001'],
              ] as const).map(([field, label, step]) => (
                <div className="form-field" key={field}>
                  <label htmlFor={`product-${field}`}>{label}{field === 'defaultSellingPrice' ? ' (VND)' : ''}</label>
                  <input id={`product-${field}`} name={field} type="number" step={step}
                    min={field === 'defaultSellingPrice' ? '0.01' : '0'}
                    max={field === 'defaultSellingPrice' ? '999999999999.99' : '9999999999.9999'}
                    required={field !== 'defaultSellingPrice' || !id || (assignmentChanged && (allStores || storeIds.length > 0))}
                    defaultValue={record?.[field] ?? (field === 'defaultSellingPrice' ? '' : '0')} />
                </div>
              ))}
              <p className="field-hint admin-span-full">{c.defaultsHint}</p>
              <fieldset className="product-store-picker admin-span-full">
                <legend>{c.assignedStores}</legend>
                <label className="product-checkbox">
                  <input type="checkbox" checked={allStores} onChange={(e) => { setAllStores(e.target.checked); setAssignmentChanged(true); }} />
                  <strong>{c.allStores}</strong>
                </label>
                <p className="field-hint">{allStores ? c.allStoresHint : c.selectedStoresHint}</p>
                {!options.stores.length && <p>{c.noActiveStores}</p>}
                {!allStores && <div className="product-store-options">
                  {options.stores.map((store) => <label className="product-checkbox" key={store.id}>
                    <input type="checkbox" checked={storeIds.includes(store.id)} onChange={(e) => {
                      setStoreIds((ids) => e.target.checked ? [...ids, store.id] : ids.filter((value) => value !== store.id));
                      setAssignmentChanged(true);
                    }} />
                    <span>{store.name} <small>({store.code})</small></span>
                  </label>)}
                </div>}
                {!!id && <>
                  <label className="product-checkbox"><input type="checkbox" name="applyDefaults" onChange={() => setAssignmentChanged(true)} />{c.applyDefaults}</label>
                  <p className="field-hint">{c.applyDefaultsHint}</p>
                </>}
              </fieldset>
              <div className="form-field admin-span-full product-image-field">
                <label htmlFor="product-image-upload">{c.image}</label>
                <label htmlFor="product-image-upload" className="product-image-picker">
                  <ProductImage name={record?.name || c.image} imagePath={imagePath} imageKey={imageKey} previewUrl={previewUrl} />
                </label>
                <input id="product-image-upload" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="product-image-hint"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (!selected) return;
                    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
                      setError(c.imageInvalid); e.target.value = ''; return;
                    }
                    setError(''); setFile(selected); setPreviewUrl(URL.createObjectURL(selected));
                  }} />
                <p className="field-hint" id="product-image-hint">{c.imageHint}</p>
                <label htmlFor="product-bundled-image">{c.existingImage}</label>
                <select id="product-bundled-image" value={imageKey} onChange={(e) => {
                  setImageKey(e.target.value); setImagePath(''); setFile(null); setPreviewUrl(undefined);
                  const input = document.getElementById('product-image-upload') as HTMLInputElement | null;
                  if (input) input.value = '';
                }}>
                  <option value="">{c.noImage}</option>
                  {(Object.keys(productIllustrations) as (keyof typeof productIllustrations)[]).map((key) =>
                    <option key={key} value={key}>{c.illustrations[key]}</option>)}
                </select>
                <details>
                  <summary>{c.imagePath}</summary>
                  <input aria-label={c.imagePath} value={imagePath.startsWith('/products/images/') ? '' : imagePath} maxLength={500}
                    placeholder="/assets/products/…" onChange={(e) => setImagePath(e.target.value)} />
                  <p className="field-hint">{c.imagePathHint}</p>
                </details>
                {(imagePath || imageKey || file) && <button type="button" className="text-button" onClick={() => {
                  setFile(null); setPreviewUrl(undefined); setImagePath(''); setImageKey('');
                  const input = document.getElementById('product-image-upload') as HTMLInputElement | null;
                  if (input) input.value = '';
                }}>{c.removeImage}</button>}
              </div>
              <div className="form-field">
                <label htmlFor="product-shelf">
                  {c.shelfLife} {a.optional}
                </label>
                <input
                  id="product-shelf"
                  name="shelfLifeDays"
                  type="number"
                  min="0"
                  max="2147483647"
                  step="1"
                  defaultValue={record?.shelfLifeDays ?? ''}
                />
              </div>
              <div className="form-field">
                <label htmlFor="product-status">{a.status}</label>
                <select
                  id="product-status"
                  name="isActive"
                  defaultValue={String(record ? !!record.isActive : true)}
                >
                  <option value="true">{a.active}</option>
                  <option value="false">{a.inactive}</option>
                </select>
              </div>
            </div>
          </fieldset>
          {pending && <div role="alert"><p>{c.stockWarning}</p><ul>{stock.map((s) => <li key={s.locationId}>{s.locationName}: {s.quantity}</li>)}</ul></div>}
          <div className="admin-form-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => (pending ? setPending(null) : onClose())}
            >
              {pending ? a.back : a.cancel}
            </button>
            {pending ? (
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={() => void save({ ...pending, confirmDiscontinue: true })}
              >
                {busy ? a.saving : c.confirmDiscontinue}
              </button>
            ) : (
              <button className="primary-button" disabled={busy || !ready}>
                {busy ? a.saving : a.save}
              </button>
            )}
          </div>
        </form>
      )}
      {!options && (
        <button className="secondary-button" onClick={onClose}>
          {a.cancel}
        </button>
      )}
    </AdminDialog>
  );
}

function usePageCopy() {
  const { vi } = useMessages();
  const c = vi.catalog;
  const a = vi.admin;
  return { c, a };
}
