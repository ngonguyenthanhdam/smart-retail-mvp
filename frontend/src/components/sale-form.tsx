'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronLeft, Minus, Plus, Search, ShoppingBasket, Store, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import { AdminDialog } from './admin-dialog';
import { useAuth } from './auth-provider';
import { ProductImage } from './product-image';
import { catalogError } from './product-form';
import { ApiRequestError } from '@/lib/api';
import { allOptions, saveRecord, type StoreProduct, type InventoryRow } from '@/lib/catalog';
import type { Location } from '@/lib/locations';
import type { SaleDetail } from '@/lib/operations';
import { cents, formatCents, lineCents } from '@/lib/money';
import { formatMoney, formatQuantity, unitLabel } from '@/lib/format';
import { vi } from '@/i18n/vi';

type Line = { productId: string; quantity: string };
type Payload = { locationId: string; discountAmount: string; items: Line[]; clientRequestId: string; expectedTotal: string };
export function SaleForm({ onClose, onSaved }: { onClose: () => void; onSaved: (sale: SaleDetail) => void }) {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN'; const canDiscount = user?.role === 'ADMIN' || user?.role === 'STORE_MANAGER';
  const [store, setStore] = useState(''); const locationId = admin ? store : user?.locationId ?? '';
  const [stores, setStores] = useState<Location[]>([]);
  const [catalog, setCatalog] = useState<{ locationId: string; products: StoreProduct[]; inventory: InventoryRow[] } | null>(null);
  const [lines, setLines] = useState<Line[]>([]); const [discount, setDiscount] = useState('0');
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const [uncertain, setUncertain] = useState(false); const [revision, setRevision] = useState(0);
  const attempt = useRef<Payload | null>(null); const sending = useRef(false);
  const storageKey = user ? `retailsense:pending-sale:${user.id}` : '';
  const locked = busy || uncertain;
  useEffect(() => {
    if (!storageKey) return;
    // Restore an external, persisted request before another sale may be sent.
    const restore = async () => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return;
        const saved: Payload = JSON.parse(raw);
        if (!saved.clientRequestId || !saved.locationId || !Array.isArray(saved.items)) throw new Error('Invalid saved sale');
        attempt.current = saved; setStore(saved.locationId); setLines(saved.items); setDiscount(saved.discountAmount);
        setUncertain(true); setError(vi.operations.uncertainSale);
      } catch { setUncertain(true); setError('Không đọc được giao dịch đang chờ. Kiểm tra lịch sử và liên hệ quản lý trước khi tiếp tục trên trình duyệt này.'); }
    };
    void restore();
  }, [storageKey]);
  useEffect(() => {
    if (!locked) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [locked]);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    allOptions<Location>('/locations?status=active', abort.signal).then(rows => {
      if (abort.signal.aborted) return;
      const active = rows.filter(row => row.locationType === 'STORE' && row.isActive);
      setStores(active); setStore(previous => previous || active[0]?.id || '');
    }).catch(e => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [admin]);
  useEffect(() => {
    if (!locationId) return;
    const abort = new AbortController();
    Promise.all([
      allOptions<StoreProduct>(`/store-products?status=active&locationId=${locationId}`, abort.signal),
      allOptions<InventoryRow>(`/inventory?locationId=${locationId}`, abort.signal),
    ]).then(([products, inventory]) => { if (!abort.signal.aborted) setCatalog({ locationId, products: products.filter(p => p.product.isActive), inventory }); })
      .catch(e => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [locationId, revision]);
  const products = catalog?.locationId === locationId ? catalog.products : [];
  const ready = catalog?.locationId === locationId;
  const stock = (id: string) => Number(catalog?.inventory.find(row => row.productId === id)?.sellableQuantity ?? '0');
  const setting = (id: string) => products.find(p => p.productId === id);
  const fractional = (id: string) => setting(id)?.product.baseUnit?.allowFraction === true;
  const subtotal = lines.reduce((sum, line) => sum + lineCents(line.quantity, setting(line.productId)?.sellingPrice ?? '0'), BigInt(0));
  const discountValue = canDiscount ? discount : '0';
  const validDiscount = /^\d+(\.\d{1,2})?$/.test(discountValue) && cents(discountValue) <= subtotal;
  const total = subtotal - cents(discountValue);
  const validLines = lines.length > 0 && lines.every(line => !!setting(line.productId) && /^\d+(\.\d{1,4})?$/.test(line.quantity) && Number(line.quantity) > 0 && Number(line.quantity) <= stock(line.productId) && (fractional(line.productId) || Number.isInteger(Number(line.quantity))));
  const categories = [...new Map(products.filter(p => p.product.category).map(p => [p.product.category!.id, p.product.category!])).values()];
  const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const visible = products.filter(p => (!category || p.product.categoryId === category) && normalized(`${p.product.name} ${p.product.sku} ${p.product.barcode ?? ''}`).includes(normalized(search)));
  function updateQuantity(id: string, quantity: string) { attempt.current = null; setLines(previous => previous.map(line => line.productId === id ? { ...line, quantity } : line)); }
  function add(productId: string) {
    if (locked) return;
    const existing = lines.find(line => line.productId === productId);
    const amount = Math.min(Number(existing?.quantity ?? 0) + 1, stock(productId));
    if (amount <= 0 || (!existing && lines.length >= 100)) return;
    attempt.current = null; setError('');
    setLines(previous => existing ? previous.map(line => line.productId === productId ? { ...line, quantity: String(amount) } : line) : [...previous, { productId, quantity: String(amount) }]);
  }
  function review(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!validLines || !validDiscount) return; setError(''); setConfirm(true); }
  async function complete() {
    if (sending.current || !locationId || (uncertain && !attempt.current)) return;
    sending.current = true; setBusy(true); setError('');
    attempt.current ??= { locationId, discountAmount: discountValue, items: lines.map(line => ({ ...line })), clientRequestId: crypto.randomUUID(), expectedTotal: formatCents(total) };
    try { sessionStorage.setItem(storageKey, JSON.stringify(attempt.current)); }
    catch { sending.current = false; setBusy(false); setConfirm(false); setError('Trình duyệt chưa cho phép lưu giao dịch tạm. Bật lưu trữ cho trang này rồi thử lại. Chưa gửi giao dịch.'); return; }
    try { const saved = await saveRecord<SaleDetail>('/sales', attempt.current); sessionStorage.removeItem(storageKey); attempt.current = null; setUncertain(false); setConfirm(false); onSaved(saved); }
    catch (e) {
      // An ambiguous conflict can race a request that is still committing. Preserve its key.
      const unknown = !(e instanceof ApiRequestError) || e.status >= 500 || (e.status === 409 && !['PRICE_CHANGED', 'SALE_REQUEST_CONFLICT', 'INSUFFICIENT_STOCK'].includes(e.code ?? ''));
      setUncertain(unknown); setConfirm(false); setError(unknown ? vi.operations.uncertainSale : catalogError(e));
      if (!unknown) { sessionStorage.removeItem(storageKey); attempt.current = null; setCatalog(null); setRevision(value => value + 1); }
    } finally { sending.current = false; setBusy(false); }
  }
  return <div className="pos-workspace">
    <section className="pos-catalog" aria-label="Chọn sản phẩm để bán">
      <div className="pos-store-row"><span className="eyebrow"><Store size={15} /> QUẦY BÁN HÀNG</span>{admin ? <label className="pos-store-select"><span className="sr-only">Cửa hàng</span><select disabled={locked || lines.length > 0} value={store} onChange={e => { setStore(e.target.value); setCatalog(null); setCategory(''); setError(''); }}><option value="">Chọn cửa hàng</option>{stores.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label> : <strong>{user?.location?.name}</strong>}</div>
      <div className="pos-search"><Search size={20} aria-hidden="true" /><input type="search" aria-label="Tìm sản phẩm hoặc quét mã vạch" placeholder="Tìm sản phẩm, mã hàng hoặc quét mã vạch…" value={search} disabled={locked} onChange={e => setSearch(e.target.value)} onKeyDown={e => {
        if (e.key !== 'Enter') return;
        e.preventDefault(); const exact = products.find(p => p.product.barcode === search.trim() || p.product.sku === search.trim());
        if (exact) { add(exact.productId); setSearch(''); }
      }} /><kbd>↵</kbd></div>
      <div className="category-chips" aria-label="Lọc nhóm hàng"><button className={!category ? 'is-active' : ''} onClick={() => setCategory('')}>Tất cả <span>{products.length}</span></button>{categories.map(row => <button key={row.id} className={category === row.id ? 'is-active' : ''} onClick={() => setCategory(row.id)}>{row.name}</button>)}</div>
      {!ready && !error && <p className="admin-loading" role="status">{locationId ? 'Đang tải sản phẩm và tồn kho…' : 'Chọn cửa hàng để bắt đầu bán hàng.'}</p>}
      {ready && !visible.length && <div className="retail-empty"><ShoppingBasket size={38} /><h2>Chưa tìm thấy sản phẩm</h2><p>Thử tên hoặc mã hàng khác, hoặc đổi nhóm hàng.</p></div>}
      <div className="pos-product-grid">{visible.map(row => {
        const available = stock(row.productId); const selected = lines.find(line => line.productId === row.productId);
        return <button className={`pos-product ${selected ? 'is-selected' : ''}`} key={row.id} disabled={locked || available <= 0 || (!!selected && Number(selected.quantity) >= available)} onClick={() => add(row.productId)} aria-label={`Thêm ${row.product.name}, ${formatMoney(row.sellingPrice)}`}>
          <ProductImage name={row.product.name} category={row.product.category?.name} imageKey={row.product.imageKey} />
          {selected && <span className="product-selected-count"><Check size={12} /> {formatQuantity(selected.quantity)}</span>}
          <div className="pos-product-info"><span className="product-sku">{row.product.sku}</span><h3>{row.product.name}</h3><strong>{formatMoney(row.sellingPrice)} <small>/ {unitLabel(row.product.baseUnit)}</small></strong><span className={`stock-label ${available <= 0 ? 'is-empty' : available <= Number(row.minStockLevel ?? 0) ? 'is-low' : ''}`}>{available > 0 ? `Còn ${formatQuantity(available)} ${unitLabel(row.product.baseUnit)}` : 'Hết hàng còn hạn'}</span></div><span className="product-add" aria-hidden="true"><Plus size={16} /></span>
        </button>;
      })}</div><p className="illustration-note">Ảnh minh họa nhóm hàng. Kiểm tra tên và mã sản phẩm khi bán.</p>
    </section>
    <form className="pos-cart" onSubmit={review}>
      <div className="pos-cart-heading"><div><span className="eyebrow">GIAO DỊCH MỚI</span><h2><ShoppingBasket size={22} /> Giỏ hàng <span>{lines.length}</span></h2></div><button className="icon-button" type="button" aria-label="Xóa toàn bộ giỏ hàng" disabled={locked || !lines.length} onClick={() => { setLines([]); setDiscount('0'); setError(''); attempt.current = null; }}><Trash2 size={17} /></button></div>
      {error && <p className="form-error" role="alert">{error}{!uncertain && <button type="button" className="text-button" onClick={() => { setError(''); setCatalog(null); setRevision(value => value + 1); }}>Tải lại sản phẩm</button>}</p>}
      {!lines.length && <div className="cart-empty"><ShoppingBasket size={46} strokeWidth={1.2} /><h3>Giỏ hàng đang trống</h3><p>Chọn sản phẩm ở bên cạnh để bắt đầu.</p></div>}
      <div className="cart-lines">{lines.map(line => {
        const row = setting(line.productId); if (!row) return <p key={line.productId} className="form-error">Sản phẩm cần được kiểm tra lại.<button type="button" onClick={() => setLines(current => current.filter(item => item.productId !== line.productId))} disabled={locked}>Bỏ khỏi giỏ</button></p>;
        const invalid = Number(line.quantity) > stock(line.productId) || (!fractional(line.productId) && !Number.isInteger(Number(line.quantity)));
        return <article className="cart-line" key={line.productId}><ProductImage name={row.product.name} imageKey={row.product.imageKey} category={row.product.category?.name} /><div className="cart-line-content"><h3>{row.product.name}</h3><p>{formatMoney(row.sellingPrice)} / {unitLabel(row.product.baseUnit)}</p><div className="quantity-control"><button type="button" disabled={locked || Number(line.quantity) <= 1} aria-label={`Giảm ${row.product.name}`} onClick={() => updateQuantity(line.productId, String(Math.max(1, Number(line.quantity) - 1)))}><Minus size={14} /></button><input aria-label={`Số lượng ${row.product.name}`} type="number" required disabled={locked} min={fractional(line.productId) ? '0.0001' : '1'} step={fractional(line.productId) ? '0.0001' : '1'} max={stock(line.productId)} value={line.quantity} onChange={e => updateQuantity(line.productId, e.target.value)} aria-invalid={invalid} /><button type="button" disabled={locked || Number(line.quantity) >= stock(line.productId)} aria-label={`Tăng ${row.product.name}`} onClick={() => add(line.productId)}><Plus size={14} /></button></div>{invalid && <p className="field-error">{!fractional(line.productId) && !Number.isInteger(Number(line.quantity)) ? 'Đơn vị này cần số lượng nguyên.' : 'Vượt số lượng hàng còn hạn.'}</p>}</div><div className="cart-line-end"><button type="button" className="icon-button" disabled={locked} aria-label={`Bỏ ${row.product.name}`} onClick={() => { attempt.current = null; setLines(current => current.filter(item => item.productId !== line.productId)); }}><Trash2 size={15} /></button><strong>{formatMoney(formatCents(lineCents(line.quantity, row.sellingPrice)))}</strong></div></article>;
      })}</div>
      <div className="cart-checkout"><dl><div><dt>Tạm tính</dt><dd>{formatMoney(formatCents(subtotal))}</dd></div><div><dt>Giảm giá</dt><dd>{canDiscount ? <label><span className="sr-only">Giảm giá hóa đơn (đồng)</span><input className="cart-discount" type="number" min="0" max={formatCents(subtotal)} step="0.01" required disabled={locked} value={discount} onChange={e => { attempt.current = null; setDiscount(e.target.value); }} /> ₫</label> : formatMoney(0)}</dd></div><div className="cart-grand-total"><dt>Tổng thanh toán</dt><dd>{validDiscount ? formatMoney(formatCents(total)) : '—'}</dd></div></dl>
        {!validDiscount && <p className="field-error">{vi.operations.discountInvalid}</p>}
        {uncertain ? <><button type="button" className="primary-button checkout-button" disabled={busy} onClick={() => void complete()}><RefreshCw size={18} />{busy ? 'Đang kiểm tra…' : 'Kiểm tra lại giao dịch này'}</button><p className="field-hint">Gửi lại đúng giao dịch vừa thực hiện; không tạo hóa đơn trùng.</p></> : <button className="primary-button checkout-button" disabled={busy || !ready || !validLines || !validDiscount}>Hoàn tất bán hàng <ArrowRight size={19} /></button>}
        <p className="checkout-note"><ShieldCheck size={15} /> Tồn kho được kiểm tra khi xác nhận.</p><button className="text-button" type="button" disabled={locked} onClick={onClose}><ChevronLeft size={15} /> Xem lịch sử bán hàng</button>
      </div>
    </form>
    {confirm && <AdminDialog titleId="sale-confirm-title" busy={busy} onClose={() => setConfirm(false)}><div className="confirm-icon"><ShoppingBasket size={28} /></div><h2 id="sale-confirm-title">Xác nhận bán hàng</h2><p>{lines.length} sản phẩm · {admin ? stores.find(row => row.id === store)?.name : user?.location?.name}</p><p className="confirm-total">{formatMoney(formatCents(total))}</p><p className="page-description">{vi.operations.salePrompt}</p><div className="admin-form-actions"><button className="secondary-button" disabled={busy} onClick={() => setConfirm(false)}>Kiểm tra lại</button><button className="primary-button" disabled={busy} onClick={() => void complete()}>{busy ? 'Đang lưu…' : 'Xác nhận bán hàng'}</button></div></AdminDialog>}
  </div>;
}
