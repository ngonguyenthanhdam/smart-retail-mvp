'use client';
import { useFormatters } from '@/i18n/formatters';
import { useMessages, useScreen } from '@/i18n/provider';
import { LayoutGrid, List, Pencil, Package, CalendarClock } from 'lucide-react';
import { ProductImage } from './product-image';
import type { Product } from '@/lib/catalog';
import { formatMoney } from '@/lib/format';

export function CatalogViewToggle({
  view,
  onChange,
}: {
  view: 'grid' | 'table';
  onChange: (view: 'grid' | 'table') => void;
}) {
  const { t } = usePageCopy();
  return (
    <div className="segmented-control compact" aria-label={t.productDisplay}>
      <button aria-pressed={view === 'grid'} onClick={() => onChange('grid')}>
        <LayoutGrid size={16} /> {t.images}
      </button>
      <button aria-pressed={view === 'table'} onClick={() => onChange('table')}>
        <List size={16} /> {t.list}
      </button>
    </div>
  );
}
export function CatalogCard({
  product,
  sellingPrice,
  isActive = product.isActive,
  onEdit,
}: {
  product: Product;
  sellingPrice?: string;
  isActive?: boolean | null;
  onEdit?: () => void;
}) {
  const { unitLabel } = useFormatters();
  const { t } = usePageCopy();
  const { vi } = useMessages();
  return (
    <article className="catalog-product-card">
      <div className="catalog-product-visual">
        <ProductImage
          name={product.name}
          category={product.category?.name}
          imageKey={product.imageKey} imagePath={product.imagePath}
        />
        <span className={`catalog-state ${isActive ? '' : 'is-inactive'}`}>
          {isActive ? t.availableForSale : t.discontinued}
        </span>
      </div>
      <div className="catalog-product-body">
        <div className="product-meta">
          <span>{product.category?.name ?? t.uncategorized}</span>
          <span>{product.sku}</span>
        </div>
        <h2>{product.name}</h2>
        <div className="product-facts">
          <span>
            <Package size={14} /> {unitLabel(product.baseUnit)}
          </span>
          {product.trackExpiry && (
            <span>
              <CalendarClock size={14} /> {t.expiryTracked}
            </span>
          )}
        </div>
        <div className="catalog-product-footer">
          <div>
            <small>{sellingPrice !== undefined ? t.sellingPrice : t.defaultCost}</small>
            <strong>
              {sellingPrice !== undefined
                ? formatMoney(sellingPrice)
                : product.defaultCost !== undefined && product.defaultCost !== null
                  ? formatMoney(product.defaultCost)
                  : '—'}
            </strong>
          </div>
          {onEdit && (
            <button
              className="icon-button"
              aria-label={vi.admin.editRecord(product.name)}
              onClick={onEdit}
            >
              <Pencil size={17} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function usePageCopy() {
  const t = useScreen('catalog_cards');

  return { t };
}
