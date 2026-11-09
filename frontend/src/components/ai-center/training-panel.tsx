'use client';
import { useFormatters } from '@/i18n/formatters';
import { useDynamic } from '@/i18n/dynamic';
import { useScreen } from '@/i18n/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { AdminDialog } from '@/components/admin-dialog';
import type { CurrentUser } from '@/lib/auth';
import type { Dataset, Job, Models } from './types';
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

import { ResultDashboard } from './result-dashboard';
import { WorkflowStepper } from './workflow-stepper';

export function TrainingPanel({ user, dataset }: { user: CurrentUser; dataset: Dataset | null }) {
  const statusLabel = useAiStatus();
  const { dateText } = useFormatters();
  const dynamic = useDynamic();
  const { t, stages } = usePageCopy();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [models, setModels] = useState<Models | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [lightgbm, setLightgbm] = useState(true);
  const [trees, setTrees] = useState(200);
  const [rate, setRate] = useState(0.05);
  const [leaves, setLeaves] = useState(31);
  const [version, setVersion] = useState('');
  const [reason, setReason] = useState('');
  const [deploying, setDeploying] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([
      aiGet<{ items: Job[] }>('/training'),
      aiGet<Models>('/models'),
    ]);
    setJobs(a.items);
    setModels(b);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([aiGet<{ items: Job[] }>('/training'), aiGet<Models>('/models')])
      .then(([a, b]) => {
        if (!cancelled) {
          setJobs(a.items);
          setModels(b);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const jobId = job?.id;
  const running = job?.status === 'RUNNING';
  useEffect(() => {
    if (!jobId || !running) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void aiGet<Job>(`/training/${jobId}`)
        .then((data) => {
          if (!cancelled) {
            setJob(data);
            if (data.status !== 'RUNNING') void refresh().catch((e) => setError(messageOf(e)));
          }
        })
        .catch((e) => {
          if (!cancelled) setError(messageOf(e));
        });
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, running, refresh]);
  async function action(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const result = job?.result;
  const availableDays = dataset?.summary?.minimumTrainingDays ?? 0;
  const validParameters =
    !lightgbm ||
    (Number.isInteger(trees) &&
      trees >= 20 &&
      trees <= 400 &&
      Number.isFinite(rate) &&
      rate >= 0.01 &&
      rate <= 0.2 &&
      Number.isInteger(leaves) &&
      leaves >= 4 &&
      leaves <= 63);
  const blocked = !dataset
    ? t.selectADatasetInTrainingDataFirst
    : dataset.status !== 'PUBLISHED'
      ? t.theDatasetIsNotPublishedYetReturn
      : dataset.summary?.missingDays
        ? t.theDataStillHasUnknownDaysComplete
        : availableDays < 60 + 2 * days
          ? dynamic.requiredHistory(
              availableDays,
              60 + 2 * days,
              availableDays >= 120
                ? t.choose30DayModeToTestThis
                : t.provideAtLeast120ConsecutiveDaysFor,
            )
          : !validParameters
            ? t.checkTheParametersInAdvancedOptions
            : '';
  const versions = [
    ...new Set([
      'm5-quantity-v2',
      ...(models?.candidates
        .filter((c) => c.metadata?.activation_eligible && !c.metadata.contains_synthetic)
        .map((c) => c.version) ?? []),
    ]),
  ].filter((v) => v !== models?.active.model_version);
  return (
    <Section title={t.trainingResults}>
      <WorkflowStepper
        dataset={dataset}
        job={job}
        models={models}
        insufficient={
          !!dataset &&
          dataset.status === 'PUBLISHED' &&
          (!!dataset.summary?.missingDays || availableDays < 60 + 2 * days)
        }
      />
      {models && (
        <div className="ai-active-summary">
          <span className="ai-dot ready" />
          <span>{t.inProduction}</span>
          <strong>{models.active.algorithm}</strong>
          <code>{models.active.model_version}</code>
        </div>
      )}
      <details className="ai-run-config" open={!result}>
        <summary>
          {t.trainingConfiguration} <span>{dataset?.name ?? t.noDatasetSelected}</span>
        </summary>
        <div className="ai-training-start">
          <div className="ai-dataset-label">
            <span>{t.selectedDataset}</span>
            <h3>{dataset?.name ?? t.noDatasetSelected}</h3>
            {dataset && (
              <p>
                <Badge status={dataset.status} /> · {numberText(dataset.summary?.salesRows)}{' '}
                {t.rows} {numberText(dataset.summary?.series)} {t.series} {availableDays}{' '}
                {t.daysSeries}
              </p>
            )}
          </div>
          <div className="ai-fields">
            <label className="form-field">
              {t.evaluationMethod}
              <select
                aria-label={t.evaluationMethod}
                value={days}
                disabled={busy || running}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={30}>{t.experiment30DaysRecommendedForSampleData}</option>
                <option value={124}>{t.longTermEvaluation124DaysRequiresAt}</option>
              </select>
              <span className="field-hint">{t.numberOfDaysInEachAccuracyEvaluation}</span>
            </label>
            <label className="form-field">
              {t.modelsToCompare}
              <select
                aria-label={t.modelsToCompare}
                value={lightgbm ? 'lightgbm' : 'baselines'}
                disabled={busy || running}
                onChange={(e) => setLightgbm(e.target.value === 'lightgbm')}
              >
                <option value="lightgbm">{t.lightgbmTwoBaselines}</option>
                <option value="baselines">{t.twoBaselinesOnlyFast}</option>
              </select>
              <span className="field-hint">{t.compareAgainstTheSameWeekdayLastWeek}</span>
            </label>
          </div>
          <details className="ai-advanced">
            <summary>{t.advancedOptionsDefaultsCanBeRetained}</summary>
            <p>{t.lightgbmLearnsFromSalesHistoryToForecast}</p>
            <div className="ai-fields">
              <label className="form-field">
                {t.numberOfTrees}
                <input
                  type="number"
                  min={20}
                  max={400}
                  disabled={!lightgbm || busy || running}
                  value={trees}
                  onChange={(e) => setTrees(Number(e.target.value))}
                />
                <span className="field-hint">{t.numberOfModelBuildingStepsMoreTrees}</span>
              </label>
              <label className="form-field">
                {t.learningRate}
                <input
                  type="number"
                  min={0.01}
                  max={0.2}
                  step={0.01}
                  disabled={!lightgbm || busy || running}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                />
                <span className="field-hint">{t.adjustmentSizeAtEachLearningStepDefault}</span>
              </label>
              <label className="form-field">
                {t.maximumLeaves}
                <input
                  type="number"
                  min={4}
                  max={63}
                  disabled={!lightgbm || busy || running}
                  value={leaves}
                  onChange={(e) => setLeaves(Number(e.target.value))}
                />
                <span className="field-hint">{t.complexityOfEachTreeDefault31Very}</span>
              </label>
            </div>
          </details>
          {blocked && (
            <div className="ai-notice" role="status">
              {blocked}
              {days === 124 && availableDays >= 120 && availableDays < 308 && (
                <button className="ai-link" type="button" onClick={() => setDays(30)}>
                  {t.use30DayMode}
                </button>
              )}
            </div>
          )}
          <div className="ai-start-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy || running || !!blocked}
              onClick={() =>
                void action(async () => {
                  setJob(
                    await aiPost<Job>('/training', {
                      datasetId: dataset!.id,
                      evaluationDays: days,
                      algorithms: [
                        'SeasonalNaive',
                        'RollingMean28',
                        ...(lightgbm ? ['LightGBM'] : []),
                      ],
                      parameters: { n_estimators: trees, learning_rate: rate, num_leaves: leaves },
                      confirmed: true,
                    }),
                  );
                  await refresh();
                })
              }
            >
              <Play size={17} />
              {running ? t.training : t.startTraining}
            </button>
            <p className="field-hint">{t.resultsAreSavedAsAVersionFor}</p>
            {running && (
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t.stopThisTrainingRunTheDatasetWill))
                    void action(async () =>
                      setJob(await aiPost<Job>(`/training/${job!.id}/cancel`)),
                    );
                }}
              >
                {t.cancelRun}
              </button>
            )}
          </div>
        </div>
      </details>
      <ErrorBox error={error} />
      <div className="ai-fields">
        <label className="form-field">
          {t.viewTrainingRun}
          <select
            aria-label={t.trainingRun}
            value={job?.id ?? ''}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value)
                void action(async () => setJob(await aiGet<Job>(`/training/${e.target.value}`)));
              else setJob(null);
            }}
          >
            <option value="">{t.noResultSelected}</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {dateText(j.createdAt)} · {statusLabel(j.status)} · {j.modelVersion.slice(0, 11)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void action(refresh)}
        >
          <RefreshCw size={16} />
          {t.refreshResults}
        </button>
      </div>
      {job && (
        <div className="ai-job" aria-live="polite">
          <Badge status={job.status} />
          <strong>{stages.find(([s]) => s === job.progress?.stage)?.[1] ?? t.prepare}</strong>
          {job.error && <ErrorBox error={job.error} />}
          <details>
            <summary>{t.viewDetailedProgress}</summary>
            <code>{job.modelVersion}</code>
            {job.progress?.events.map((event, i) => (
              <p key={i}>
                {dateText(event.at)} · {stages.find(([s]) => s === event.stage)?.[1] ?? event.stage}
              </p>
            ))}
          </details>
        </div>
      )}
      {result ? (
        <ResultDashboard key={job!.id} result={result} />
      ) : (
        <div className="ai-results-empty">
          <h3>{running ? t.generatingResultsFromYourDataset : t.noResultSelectedYet}</h3>
          <p>{running ? t.youCanContinueChattingWhileYouWait : t.startTrainingOrSelectASavedRun}</p>
        </div>
      )}
      {models && (
        <details className="ai-registry">
          <summary>{t.productionModelVersionManagement}</summary>
          <div className="ai-active">
            <Badge status="ACTIVE" />
            <strong>{models.active.model_version}</strong>
            <span>{models.active.algorithm}</span>
          </div>
          <p className="field-hint">{t.onlyEligibleVersionsCanBeActivatedSynthetic}</p>
          <DataTable
            rows={models.candidates.map((c) => ({
              [t.version]: c.version,
              [t.model]: c.metadata?.algorithm,
              [t.status]: statusLabel(c.state),
              [t.eligibleForActivation]:
                c.metadata?.activation_eligible && !c.metadata.contains_synthetic ? t.yes : t.no,
              [t.createdAt]: dateText(c.createdAt),
            }))}
          />
          {user.role === 'ADMIN' ? (
            <div className="ai-confirm">
              <div className="ai-fields">
                <label className="form-field">
                  {t.switchToVersion}
                  <select value={version} onChange={(e) => setVersion(e.target.value)}>
                    <option value="">{t.selectAnEligibleVersion}</option>
                    {versions.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  {t.reasonForSwitching}
                  <input
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={busy || !version || !reason.trim()}
                onClick={() => setDeploying(true)}
              >
                {t.activateVersion}
              </button>
              <details>
                <summary>{t.switchHistory}</summary>
                <DataTable
                  rows={models.deployments.map((d) => ({
                    [t.fromVersion]: d.previousVersion,
                    [t.toVersion]: d.modelVersion,
                    [t.status]: statusLabel(d.status),
                    [t.reason]: d.reason,
                    [t.time]: dateText(d.createdAt),
                  }))}
                />
              </details>
            </div>
          ) : (
            <p className="field-hint">{t.onlyAdministratorsCanChangeTheProductionModel}</p>
          )}
        </details>
      )}
      {deploying && models && (
        <AdminDialog titleId="activate-model-title" busy={busy} onClose={() => setDeploying(false)}>
          <h2 id="activate-model-title">
            {t.activateVersion} {version}?
          </h2>
          <p>
            {t.replace} {models.active.model_version} {t.with} {version}{' '}
            {t.forSubsequentForecastsAcrossTheSystemSaved}
          </p>
          <p>
            {t.reason2} {reason}
          </p>
          <ErrorBox error={error} />
          <div className="admin-form-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setDeploying(false)}
            >
              {t.back}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setModels(
                    await aiPost<Models>('/models/activate', {
                      version,
                      expectedVersion: models.active.model_version,
                      reason,
                      confirmed: true,
                    }),
                  );
                  setVersion('');
                  setReason('');
                  setDeploying(false);
                })
              }
            >
              {t.confirmActivation}
            </button>
          </div>
        </AdminDialog>
      )}
    </Section>
  );
}

function usePageCopy() {
  const t = useScreen('training_panel');
  const stages = [
    ['DATA_COLLECTION', t.collectData],
    ['EDA', t.exploreValidate],
    ['FEATURES', t.createFeatures],
    ['SPLITTING', t.splitByTime],
    ['TRAINING', t.train],
    ['EVALUATION', t.evaluate],
    ['COMPLETED', t.saveCandidate],
  ];
  return { t, stages };
}
