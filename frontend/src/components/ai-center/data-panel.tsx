'use client';
import { useDynamic } from '@/i18n/dynamic';
import { useScreen } from '@/i18n/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Database, FileCheck2, FileSpreadsheet, Plus, ArrowRight } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { CurrentUser } from '@/lib/auth';
import type { Config, Dataset, DatasetFile, Kind } from './types';
import {
  aiGet,
  aiPost,
  Badge,
  DataTable,
  ErrorBox,
  messageOf,
  numberText,
  Section,
  useAiStatus,
} from './shared';

import { StatusValue } from '../status-value';

function MappingEditor({
  file,
  config,
  busy,
  save,
}: {
  file: DatasetFile;
  config: Config;
  busy: boolean;
  save: (kind: Kind, mapping: Record<string, string>) => void;
}) {
  const { t, kindNames } = usePageCopy();
  const [kind, setKind] = useState<Kind>(file.kind ?? 'SALES');
  const [mapping, setMapping] = useState(file.mapping);
  const [confirmed, setConfirmed] = useState(false);
  const fields = config.fields[kind];
  const ignored = file.profile.columns.filter((c) => !Object.values(mapping).includes(c));
  return (
    <details className="ai-details">
      <summary>{t.columnMappingAndPreview}</summary>
      <label className="form-field">
        {t.dataType}
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as Kind);
            setMapping({});
            setConfirmed(false);
          }}
        >
          {Object.entries(kindNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="ai-fields">
        {[...fields.required, ...fields.optional].map((field) => (
          <label className="form-field" key={field}>
            {field}
            {fields.required.includes(field) ? ' *' : ''}
            <select
              value={mapping[field] ?? ''}
              onChange={(e) => {
                setMapping({ ...mapping, [field]: e.target.value });
                setConfirmed(false);
              }}
            >
              <option value="">{t.doNotUse}</option>
              {file.profile.columns.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="field-hint">
        {t.columnsExcludedFromTheSnapshot} {ignored.join(', ') || t.none}
        {t.onlyQuantityRepresentsTheQuantityInBase}
      </p>
      <label className="ai-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t.iHaveCheckedTheUnitsMappingAnd}
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={busy || !confirmed}
        onClick={() => save(kind, Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)))}
      >
        {t.confirmMapping}
      </button>
      <h4>{t.previewSourceContent}</h4>
      <DataTable rows={file.profile.sample.map((r) => ({ [t.row]: r.row, ...r.values }))} />
    </details>
  );
}
function template(kind: Kind) {
  const contents: Record<Kind, string> = {
    SALES:
      'date,store_id,product_id,quantity,unit_code,source\n' +
      Array.from(
        { length: 140 },
        (_, i) =>
          `${new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)},DEMO_STORE,DEMO_PRODUCT,${i % 11 === 0 ? 0 : 3 + (i % 7)},PCS,SYNTHETIC`,
      ).join('\n') +
      '\n',
    PRODUCTS: 'product_id,name,unit_code,source\nDEMO_PRODUCT,San pham minh hoa,PCS,SYNTHETIC\n',
    INVENTORY:
      'date,store_id,product_id,quantity,unit_code,lot_number,source\n2026-01-01,DEMO_STORE,DEMO_PRODUCT,20,PCS,DEMO_LOT,SYNTHETIC\n',
  };
  const url = URL.createObjectURL(new Blob([contents[kind]], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${kind.toLowerCase()}-demo-template.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DataPanel({
  user,
  config,
  onDataset,
  onReady,
}: {
  user: CurrentUser;
  config: Config;
  onDataset: (dataset: Dataset | null) => void;
  onReady: () => void;
}) {
  const dynamic = useDynamic();
  const { t, kindNames } = usePageCopy();
  const statusLabel = useAiStatus();
  const [items, setItems] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState<Dataset | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [scopeChosen, setScopeChosen] = useState(user.role !== 'ADMIN');
  const lock = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState('CSV');
  const [location, setLocation] = useState(user.locationId ?? '');
  const [external, setExternal] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const refreshList = useCallback(async () => {
    const data = await aiGet<{ items: Dataset[] }>('/datasets');
    setItems(data.items);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void aiGet<{ items: Dataset[] }>('/datasets')
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const receive = (data: Dataset) => {
    setSelected(data);
    onDataset(data);
  };
  async function act(action: () => Promise<Dataset>, next = false) {
    if (lock.current) return;
    lock.current = true;
    setError('');
    setBusy(true);
    try {
      receive(await action());
      await refreshList();
      if (next) onReady();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function files(input: FileList | null, replaceId?: string) {
    if (!input?.length || !selected || lock.current) return;
    const list = Array.from(input);
    const previous = selected.files ?? [];
    const active = previous.filter((f) => f.id !== replaceId);
    if (
      list.length + active.length > 20 ||
      list.some((f) => f.size > 10485760) ||
      list.reduce(
        (s, f) => s + f.size,
        active.reduce((s, f) => s + f.bytes, 0),
      ) > 104857600
    ) {
      setError(t.upTo20Files10MbPer);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      for (const [index, file] of list.entries()) {
        setUploading(dynamic.uploading(index + 1, list.length, file.name));
        const body = new FormData();
        body.append('files', file);
        receive(
          await apiRequest<Dataset>(
            `/ai-center/datasets/${selected.id}/files${replaceId ? `/${replaceId}/replacement` : ''}`,
            { method: 'POST', body },
            60000,
          ),
        );
      }
      setUploading(t.filesUploadedCheckingAndReconcilingTheComplete);
      receive(await aiPost<Dataset>(`/datasets/${selected.id}/validate`));
      await refreshList();
    } catch (e) {
      setError(messageOf(e));
      try {
        receive(await aiGet<Dataset>(`/datasets/${selected.id}`));
      } catch {}
    } finally {
      lock.current = false;
      setUploading('');
      setBusy(false);
    }
  }
  const editable = selected?.status === 'STAGING';
  const summary = selected?.summary;
  const internalMismatch =
    !!selected &&
    !selected.external &&
    selected.sourceKind === 'CSV' &&
    summary?.issues.some(
      (i) =>
        (i.code === 'ACCESS_DENIED' && i.column === 'store_id') ||
        (i.code === 'MISSING_REQUIRED_FIELDS' && ['product_id', 'store_id'].includes(i.column)),
    );
  const chooseScope = user.role === 'ADMIN' && source === 'CSV';
  return (
    <Section title={t.trainingData}>
      <div className="ai-dataset-toolbar">
        <label className="form-field">
          Dataset
          <select
            aria-label={t.recentDatasets}
            value={selected?.id ?? ''}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) void act(() => aiGet(`/datasets/${e.target.value}`));
              else {
                setSelected(null);
                onDataset(null);
              }
            }}
          >
            <option value="">{t.selectADatasetOrCreateOne}</option>
            {items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ·{' '}
                {d.status === 'PUBLISHED'
                  ? t.confirmed
                  : d.status === 'STAGING'
                    ? t.preparing
                    : statusLabel(d.status)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label={t.newDataset}
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            setSelected(null);
            onDataset(null);
            setExpanded(true);
          }}
        >
          {selected ? <Plus size={16} /> : <Upload size={16} />}
          {selected ? t.newDataset : t.importCsv}
        </button>
      </div>
      {!selected && !expanded && (
        <div className="ai-data-empty">
          <Database size={26} />
          <div>
            <strong>{t.prepareDataForForecasting}</strong>
            <p>{t.selectMultipleCsvFilesToValidateAnd}</p>
          </div>
        </div>
      )}
      {selected && (
        <div className="ai-dataset-overview">
          <div className="ai-row ai-between">
            <strong>{selected.name}</strong>
            <div className="ai-row">
              <Badge
                status={
                  selected.status === 'STAGING' && summary
                    ? summary.valid
                      ? 'READY'
                      : 'REVIEW'
                    : selected.status
                }
              />
              {selected.synthetic && (
                <span
                  className="ai-demo-badge"
                  title={t.syntheticDataOnlyVerifiesTechnicalOperationIt}
                >
                  {t.demoData}
                </span>
              )}
            </div>
          </div>
          <div className="ai-stats">
            {[
              [t.salesRows, summary?.salesRows],
              [t.products, summary?.products],
              [t.store, summary?.stores],
              [t.csvFiles, selected.files?.length ?? 0],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{numberText(value)}</strong>
              </div>
            ))}
          </div>
          <div className="ai-row ai-between">
            <span className="field-hint">
              {summary?.start && summary.end
                ? `${summary.start} → ${summary.end}`
                : t.noValidDateRangeYet}
            </span>
            {editable ? (
              <button
                className="primary-button"
                type="button"
                disabled={busy || !summary?.valid}
                onClick={() =>
                  void act(
                    () =>
                      aiPost(`/datasets/${selected.id}/publish`, {
                        revision: selected.revision,
                        fingerprint: summary!.fingerprint,
                        confirmed: true,
                      }),
                    true,
                  )
                }
              >
                {t.confirmDataUse}
                <ArrowRight size={16} />
              </button>
            ) : (
              selected.status === 'PUBLISHED' && (
                <button type="button" className="secondary-button" onClick={onReady}>
                  {t.continueTraining}
                  <ArrowRight size={16} />
                </button>
              )
            )}
          </div>
          {editable && (
            <p className="ai-upload-receipt" role="status">
              {uploading ||
                (busy
                  ? t.processingData
                  : summary?.valid
                    ? dynamic.uploadValidated(selected.files?.length ?? 0)
                    : selected.files?.length
                      ? dynamic.uploadReview(
                          selected.files.length,
                          summary
                            ? `${numberText(summary.issueCount)} ${t.issuesToResolve}`
                            : t.dataReviewRequired,
                        )
                      : t.noFilesUploadedOpenFileManagementTo)}
            </p>
          )}
        </div>
      )}
      {selected && summary && (
        <div className="ai-quality-grid" aria-label={t.dataQuality}>
          <StatusValue
            tone={summary.issueCount > 0 ? 'danger' : summary.valid ? 'success' : 'neutral'}
            label={t.issuesToResolve}
          >
            {numberText(summary.issueCount)}
          </StatusValue>
          <StatusValue tone={summary.missingDays > 0 ? 'warning' : 'success'} label={t.unknownDays}>
            {numberText(summary.missingDays)}
          </StatusValue>
          <StatusValue tone="neutral" label={t.recordedZeroSalesDays}>
            {numberText(summary.zeroDays)}
          </StatusValue>
        </div>
      )}
      <details
        className="ai-data-management"
        hidden={!selected && !expanded}
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary>
          {selected ? dynamic.manageFiles(selected.files?.length ?? 0) : t.datasetSettings}
          <span>
            {selected ? (selected.external ? t.external : t.internal) : t.csvOrExistingData}
          </span>
        </summary>
        {!selected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(() =>
                aiPost('/datasets', {
                  name,
                  sourceKind: source,
                  locationId: external ? null : location || null,
                  external,
                  synthetic,
                }),
              );
            }}
            className="ai-stack"
          >
            <div className="ai-fields">
              <label className="form-field">
                {t.datasetName}
                <input
                  required
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.salesHistoryForTheLatestQuarter}
                />
              </label>
              <label className="form-field">
                {t.source}
                <select
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setScopeChosen(false);
                    if (e.target.value === 'DATABASE') setExternal(false);
                  }}
                >
                  <option value="CSV">{t.uploadMultipleCsvFiles}</option>
                  <option value="DATABASE">{t.databaseSnapshot}</option>
                </select>
              </label>
              <label className="form-field">
                {t.storeScope}
                <select
                  value={location}
                  disabled={external || user.role !== 'ADMIN'}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  {user.role === 'ADMIN' && <option value="">{t.allPermittedStores}</option>}
                  {config.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ai-row">
              {chooseScope && (
                <fieldset className="ai-source-choice">
                  <legend>{t.whatTypeOfStoreProductIdsDoes}</legend>
                  <label className={scopeChosen && external ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="dataset-scope"
                      required
                      checked={scopeChosen && external}
                      onChange={() => {
                        setExternal(true);
                        setScopeChosen(true);
                      }}
                    />
                    <span>
                      <strong>{t.externalDataSampleCsv}</strong>
                      <small>{t.chooseForDatasetsAiCenterOrIds}</small>
                    </span>
                  </label>
                  <label className={scopeChosen && !external ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="dataset-scope"
                      required
                      checked={scopeChosen && !external}
                      onChange={() => {
                        setExternal(false);
                        setScopeChosen(true);
                      }}
                    />
                    <span>
                      <strong>{t.internalData}</strong>
                      <small>{t.storeProductAndUnitCodesMustMatch}</small>
                    </span>
                  </label>
                </fieldset>
              )}
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={synthetic}
                  onChange={(e) => setSynthetic(e.target.checked)}
                />
                {t.demoSyntheticDataTechnicalTestingOnly}
              </label>
            </div>
            <details>
              <summary>{t.dataSourceRules}</summary>
              <p className="field-hint">{t.databaseSnapshotsIncludeOnlyDaysWithConfirmed}</p>
            </details>
            <button className="primary-button" disabled={busy || (chooseScope && !scopeChosen)}>
              {source === 'CSV' ? <Upload size={16} /> : <Database size={16} />}
              {busy ? t.preparing2 : t.createDataset}
            </button>
          </form>
        )}
        {selected && (
          <div className="ai-stack">
            {editable && selected.sourceKind === 'CSV' && (
              <label
                className={`ai-dropzone ${selected.files?.length ? 'ai-dropzone-compact' : ''} ${busy ? 'ai-disabled' : ''}`}
              >
                <Upload size={22} />
                <strong>
                  {uploading ||
                    (busy
                      ? t.processing
                      : selected.files?.length
                        ? t.addCsvFiles
                        : t.selectOneOrMoreCsvFiles)}
                </strong>
                <span>{t.utf820Files10MbFile}</span>
                <input
                  className="ai-file-input"
                  aria-label={t.selectTrainingCsvFiles}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  disabled={busy}
                  onChange={(e) => {
                    void files(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {editable && internalMismatch && (
              <div className="ai-source-mismatch" role="alert">
                <h3>{t.csvIdsDoNotMatchInternalData}</h3>
                <p>{t.theDatasetIsBeingMatchedAgainstStores}</p>
                {user.role === 'ADMIN' ? (
                  <>
                    <p className="field-hint">{t.thisRemovesTheInternalStoreLinkKeeps}</p>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          aiPost(`/datasets/${selected.id}/external-source`, {
                            revision: selected.revision,
                            confirmed: true,
                          }),
                        )
                      }
                    >
                      {t.switchToExternalDataAndRevalidate}
                    </button>
                  </>
                ) : (
                  <p>{t.useDataFromYourAssignedStoreAnd}</p>
                )}
              </div>
            )}
            {summary && (
              <div className="ai-summary ai-summary-compact">
                <h3>{summary.valid ? t.batchValidationPassed : t.resolveIssuesBeforeConfirming}</h3>
                <p>
                  {summary.start} → {summary.end} {t.unit} {summary.units.join(', ') || '—'}
                </p>
                <details>
                  <summary>{t.dataAndUnitHandling}</summary>
                  <ul>
                    {summary.transformations.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </details>
                {summary.issueCount > 0 && (
                  <details>
                    <summary>
                      {t.view} {summary.issueCount} {t.issuesToResolve2}
                    </summary>
                    <DataTable
                      rows={summary.issues.map((i) => ({
                        File: i.file,
                        [t.row]: i.row,
                        [t.column]: i.column,
                        [t.error]: i.reason,
                        [t.howToFix]: i.fix,
                      }))}
                    />
                  </details>
                )}
                <details>
                  <summary>{t.viewHistoryByStoreProduct}</summary>
                  <DataTable rows={summary.pairs} />
                </details>
              </div>
            )}
            {editable && (
              <>
                <div className="ai-row">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !selected.files?.length}
                    onClick={() => void act(() => aiPost(`/datasets/${selected.id}/validate`))}
                  >
                    <FileCheck2 size={16} />
                    {t.validateTheEntireBatch}
                  </button>
                  <button
                    type="button"
                    className="ai-link ai-danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t.cancelStagingAndDeleteThisDatasetS))
                        void act(() =>
                          apiRequest(`/ai-center/datasets/${selected.id}`, { method: 'DELETE' }),
                        );
                    }}
                  >
                    {t.cancelDataset}
                  </button>
                </div>
              </>
            )}
            {selected.files?.map((file) => (
              <article className="ai-file" key={`${file.id}-${selected.revision}`}>
                <div className="ai-row ai-between">
                  <div className="ai-file-identity">
                    <FileSpreadsheet size={21} />
                    <div>
                      <h4>{file.name}</h4>
                      <p className="field-hint">
                        {file.kind ? kindNames[file.kind] : t.notIdentified} ·{' '}
                        {numberText(file.rows)} {t.rows}{' '}
                        {numberText(Math.round((file.bytes / 1024) * 10) / 10)} KB
                      </p>
                    </div>
                  </div>
                  <Badge status={file.status} />
                </div>
                {file.issues.length > 0 && (
                  <details>
                    <summary>
                      {numberText(file.profile.issueCount)} {t.issuesShowingUpTo100}
                    </summary>
                    <DataTable
                      rows={file.issues.map((i) => ({
                        File: i.file,
                        [t.row]: i.row,
                        [t.column]: i.column,
                        [t.code]: i.code,
                        [t.cause]: i.reason,
                        [t.howToFix]: i.fix,
                      }))}
                    />
                  </details>
                )}
                <details className="ai-file-options">
                  <summary>{t.fileDetailsReplacement}</summary>
                  {editable && file.profile.columns.length > 0 ? (
                    <MappingEditor
                      config={config}
                      file={file}
                      busy={busy}
                      save={(kind, mapping) =>
                        void act(() =>
                          aiPost(`/datasets/${selected.id}/files/${file.id}/mapping`, {
                            kind,
                            mapping,
                          }),
                        )
                      }
                    />
                  ) : (
                    <details>
                      <summary>{t.preview}</summary>
                      <DataTable
                        rows={file.profile.sample.map((r) => ({ [t.row]: r.row, ...r.values }))}
                      />
                    </details>
                  )}
                  {editable && (
                    <div className="ai-row">
                      <label className="ai-file-replace">
                        {t.replaceFile}
                        <input
                          aria-label={dynamic.replaceFile(file.name)}
                          type="file"
                          accept=".csv"
                          disabled={busy}
                          onChange={(e) => {
                            void files(e.target.files, file.id);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="ai-link ai-danger"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            apiRequest(`/ai-center/datasets/${selected.id}/files/${file.id}`, {
                              method: 'DELETE',
                            }),
                          )
                        }
                      >
                        {t.remove}
                      </button>
                    </div>
                  )}
                </details>
              </article>
            ))}
          </div>
        )}
        <details className="ai-templates">
          <summary>{t.downloadCsvTemplatesSyntheticData}</summary>
          <div className="ai-template-links">
            {Object.entries(kindNames).map(([k, v]) => (
              <button type="button" className="ai-link" key={k} onClick={() => template(k as Kind)}>
                {v}
              </button>
            ))}
          </div>
        </details>
      </details>
      <ErrorBox error={error} />
    </Section>
  );
}

function usePageCopy() {
  const t = useScreen('data_panel');
  const kindNames: Record<Kind, string> = {
    SALES: t.salesHistory,
    PRODUCTS: t.productCatalog,
    INVENTORY: t.openingInventory,
  };
  return { t, kindNames };
}
