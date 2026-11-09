'use client';
import { useFormatters } from '@/i18n/formatters';
import { Feedback } from '@/i18n/feedback';
import { useMessages } from '@/i18n/provider';
import { catalogError } from '@/lib/catalog';

import { useEffect, useState } from 'react';
import { AdminDialog } from '@/components/admin-dialog';
import { useAuth } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { InventoryRow, LotPage } from '@/lib/catalog';

import { StatusBadge, StatusValue } from './status-value';
import { expiryTone } from '@/lib/presentation-status';
import { formatMoney } from '@/lib/format';

export function InventoryLotsDialog({
  row,
  onClose,
}: {
  row: Pick<
    InventoryRow,
    'locationId' | 'productId' | 'sku' | 'productName' | 'locationName' | 'baseUnitCode'
  >;
  onClose: () => void;
}) {
  const { formatQuantityWithUnit } = useFormatters();
  const { statusCopy, c, a, i } = usePageCopy();
  const { user } = useAuth();
  const costs = user?.role !== 'STAFF';
  const [data, setData] = useState<LotPage | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    apiRequest<LotPage>(`/inventory/${row.locationId}/${row.productId}/lots`, {
      signal: abort.signal,
    })
      .then((r) => {
        if (!abort.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [row.locationId, row.productId, revision]);
  return (
    <AdminDialog titleId="lots-title" onClose={onClose}>
      <h2 id="lots-title">{i.lotTitle}</h2>
      <p className="admin-dialog-description">
        {row.sku} · {row.productName} · {row.locationName}
      </p>
      {error && (
        <div role="alert" className="form-error">
          {<Feedback text={error} />}{' '}
          <button
            className="text-button"
            onClick={() => {
              setError('');
              setRevision(revision + 1);
            }}
          >
            {a.retry}
          </button>
        </div>
      )}
      {!data && !error && <p role="status">{c.loading}</p>}
      {data && (
        <>
          <p className="field-hint">{i.ordering[data.ordering]}</p>
          {data.items.length === 0 ? (
            <p>{i.noLots}</p>
          ) : (
            <>
              <p className="table-scroll-hint">{statusCopy.tableHint}</p>
              <div
                className="admin-table-scroll"
                tabIndex={0}
                role="region"
                aria-label={i.lotTitle}
              >
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{i.lotNumber}</th>
                      <th>{i.quantity}</th>
                      {costs && <th>{i.unitCost}</th>}
                      <th>{i.received}</th>
                      <th>{i.expiryDate}</th>
                      <th>{a.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((lot) => (
                      <tr key={lot.id}>
                        <th scope="row">{lot.lotNumber ?? a.noValue}</th>
                        <td className="numeric-cell">
                          <StatusValue
                            tone={
                              Number(lot.quantityOnHand) > 0 &&
                              ['EXPIRED', 'EXPIRING_SOON'].includes(lot.expiryStatus)
                                ? expiryTone(lot.expiryStatus)
                                : 'neutral'
                            }
                            label={i.statuses[lot.expiryStatus]}
                          >
                            {formatQuantityWithUnit(lot.quantityOnHand, row.baseUnitCode)}
                          </StatusValue>
                        </td>
                        {costs && (
                          <td className="numeric-cell">
                            {lot.unitCost == null ? a.noValue : formatMoney(lot.unitCost)}
                          </td>
                        )}
                        <td>{lot.receivedDate}</td>
                        <td>{lot.expiryDate ?? a.noValue}</td>
                        <td>
                          <StatusBadge tone={expiryTone(lot.expiryStatus)}>
                            {i.statuses[lot.expiryStatus]}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      <div className="admin-form-actions">
        <button className="secondary-button" onClick={onClose}>
          {c.close}
        </button>
      </div>
    </AdminDialog>
  );
}

function usePageCopy() {
  const { statusCopy, vi } = useMessages();
  const c = vi.catalog;
  const a = vi.admin;
  const i = vi.inventory;
  return { statusCopy, c, a, i };
}
