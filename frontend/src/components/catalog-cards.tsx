'use client';
import { LayoutGrid, List, Pencil, Package, CalendarClock } from 'lucide-react';
import { ProductImage } from './product-image';
import type { Product } from '@/lib/catalog';
import { formatMoney, unitLabel } from '@/lib/format';

export function CatalogViewToggle({ view, onChange }: { view: 'grid' | 'table'; onChange: (view: 'grid' | 'table') => void }) {
  return <div className="segmented-control compact" aria-label="Cách hiển thị sản phẩm"><button aria-pressed={view === 'grid'} onClick={() => onChange('grid')}><LayoutGrid size={16} /> Hình ảnh</button><button aria-pressed={view === 'table'} onClick={() => onChange('table')}><List size={16} /> Danh sách</button></div>;
}
export function CatalogCard({ product, sellingPrice, isActive = product.isActive, onEdit }: { product: Product; sellingPrice?: string; isActive?: boolean | null; onEdit?: () => void }) {
  return <article className="catalog-product-card"><div className="catalog-product-visual"><ProductImage name={product.name} category={product.category?.name} imageKey={product.imageKey} /><span className={`catalog-state ${isActive ? '' : 'is-inactive'}`}>{isActive ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}</span></div><div className="catalog-product-body"><div className="product-meta"><span>{product.category?.name ?? 'Chưa phân nhóm'}</span><span>{product.sku}</span></div><h2>{product.name}</h2><div className="product-facts"><span><Package size={14} /> {unitLabel(product.baseUnit)}</span>{product.trackExpiry && <span><CalendarClock size={14} /> Có hạn dùng</span>}</div><div className="catalog-product-footer"><div><small>{sellingPrice !== undefined ? 'Giá bán' : 'Giá vốn mặc định'}</small><strong>{sellingPrice !== undefined ? formatMoney(sellingPrice) : product.defaultCost !== undefined && product.defaultCost !== null ? formatMoney(product.defaultCost) : '—'}</strong></div>{onEdit && <button className="icon-button" aria-label={`Sửa ${product.name}`} onClick={onEdit}><Pencil size={17} /></button>}</div></div></article>;
}
