'use client';
import { useFormatters } from '@/i18n/formatters';
import { useMessages } from '@/i18n/provider';
import { AdminDialog } from '@/components/admin-dialog';
import { useAuth } from '@/components/auth-provider';
import { type SaleDetail as Detail } from '@/lib/operations';

import { formatMoney, formatQuantity } from '@/lib/format';
import { StatusBadge } from './status-value';
import { operationTone } from '@/lib/presentation-status';

export function SaleDetail({ record, onClose }: { record: Detail; onClose: () => void }) {
  const { displayDate, unitLabel } = useFormatters();
  const { statusCopy, vi, importCopy, o } = usePageCopy();
  const { user } = useAuth();
  const costs = user?.role !== 'STAFF';
  return (
    <AdminDialog titleId="sale-detail-title" onClose={onClose}>
      <div className="operation-dialog">
        <h2 id="sale-detail-title">{o.saleDetail}</h2>
        <p className="operation-number">{record.invoiceNumber}</p>
        <p>
          {record.location?.name} ·{' '}
          <StatusBadge tone={operationTone(record.status)}>{o.status[record.status]}</StatusBadge> ·{' '}
          {displayDate(record.soldAt)}
        </p>
        <p>
          {o.createdBy}: {record.creator?.fullName ?? vi.admin.noValue}
        </p>
        <p>{record.importJobId ? importCopy.origin.historical : importCopy.origin.live}</p>
        <p className="table-scroll-hint">{statusCopy.tableHint}</p>
        <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={o.items}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{vi.catalog.product}</th>
                <th>{o.quantity}</th>
                <th>{o.unitPrice}</th>
                <th>{o.lineTotal}</th>
                {costs && <th>{o.cogs}</th>}
              </tr>
            </thead>
            <tbody>
              {record.items.map((i) => (
                <tr key={i.id}>
                  <th scope="row">
                    {i.product?.name}
                    <span className="admin-cell-note">{i.product?.sku}</span>
                  </th>
                  <td className="numeric-cell">
                    {formatQuantity(i.quantity)} {unitLabel(i.product?.baseUnit)}
                  </td>
                  <td className="numeric-cell">{formatMoney(i.unitPrice)}</td>
                  <td className="numeric-cell">{formatMoney(i.lineTotal)}</td>
                  {costs && (
                    <td className="numeric-cell">
                      {i.costOfGoodsSold == null ? '—' : formatMoney(i.costOfGoodsSold)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="operation-totals">
          <div>
            <dt>{o.subtotal}</dt>
            <dd>{formatMoney(record.subtotal)}</dd>
          </div>
          <div>
            <dt>{o.discount}</dt>
            <dd>{formatMoney(record.discountAmount)}</dd>
          </div>
          <div>
            <dt>{o.total}</dt>
            <dd>
              <strong>{formatMoney(record.totalAmount)}</strong>
            </dd>
          </div>
        </dl>
        <div className="admin-form-actions">
          <button className="secondary-button" onClick={onClose}>
            {vi.catalog.close}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

function usePageCopy() {
  const { statusCopy, vi, importCopy } = useMessages();
  const o = vi.operations;
  return { statusCopy, vi, importCopy, o };
}
