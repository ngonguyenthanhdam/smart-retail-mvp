'use client';
import { useFormatters } from '@/i18n/formatters';
import { Feedback } from '@/i18n/feedback';
import { useMessages, useScreen } from '@/i18n/provider';
import { catalogError } from '@/lib/catalog';
import { useState } from 'react';
import { History, ShoppingBasket, CheckCircle2 } from 'lucide-react';
import { OperationList } from './operation-list';
import { SaleDetail } from './sale-detail';
import { SaleForm } from './sale-form';
import { apiRequest } from '@/lib/api';
import { type Sale, type SaleDetail as Detail } from '@/lib/operations';
import { formatMoney } from '@/lib/format';

import { StatusBadge } from './status-value';
import { operationTone } from '@/lib/presentation-status';

export function SalesPage() {
  const { displayDate } = useFormatters();
  const { t, o, a } = usePageCopy();
  const [mode, setMode] = useState<'pos' | 'history'>('pos');
  const [revision, setRevision] = useState(0);
  const [success, setSuccess] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      setDetail(await apiRequest<Detail>(`/sales/${id}`));
    } catch (e) {
      setError(catalogError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content sales-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.storeTransactions}</p>
          <h1>{t.sales}</h1>
          <p className="page-description">{t.selectProductsReviewTheCartAndComplete}</p>
        </div>
        <div className="segmented-control" aria-label={t.salesMode}>
          <button
            aria-pressed={mode === 'pos'}
            onClick={() => {
              setMode('pos');
              setError('');
            }}
          >
            <ShoppingBasket size={17} /> {t.pointOfSale}
          </button>
          <button
            aria-pressed={mode === 'history'}
            onClick={() => {
              setMode('history');
              setError('');
            }}
          >
            <History size={17} /> {t.history}
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {<Feedback text={error} />}
        </p>
      )}
      {success && (
        <p className="form-success sale-success" role="status">
          <CheckCircle2 size={18} />
          {o.saleSaved}
          <button className="text-button" onClick={() => setSuccess(false)}>
            {t.close}
          </button>
        </p>
      )}
      <div hidden={mode !== 'pos'}>
        <SaleForm
          key={revision}
          onClose={() => setMode('history')}
          onSaved={(sale) => {
            setDetail(sale);
            setSuccess(true);
            setRevision((value) => value + 1);
          }}
        />
      </div>
      {mode === 'history' && (
        <OperationList<Sale>
          embedded
          path="/sales"
          title={t.salesHistory}
          description={t.lookUpRecordedStoreInvoices}
          revision={revision}
          createLabel={o.newSale}
          onCreate={() => setMode('pos')}
          statuses={['COMPLETED', 'VOIDED']}
          columns={[o.invoiceNumber, o.location, o.soldAt, a.status, o.total, a.actions]}
          row={(sale) => (
            <>
              <th scope="row" className="operation-number">
                {sale.invoiceNumber}
              </th>
              <td>{sale.location?.name ?? a.noValue}</td>
              <td>{displayDate(sale.soldAt)}</td>
              <td>
                <StatusBadge tone={operationTone(sale.status)}>{o.status[sale.status]}</StatusBadge>
              </td>
              <td className="numeric-cell">{formatMoney(sale.totalAmount)}</td>
              <td>
                <button className="text-button" disabled={busy} onClick={() => void open(sale.id)}>
                  {o.view}
                </button>
              </td>
            </>
          )}
        />
      )}
      {detail && <SaleDetail record={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function usePageCopy() {
  const { vi } = useMessages();
  const t = useScreen('sales_page');
  const o = vi.operations;
  const a = vi.admin;
  return { t, o, a };
}
