'use client';
import { useScreen } from '@/i18n/provider';
import {
  Database,
  ScanSearch,
  Layers,
  Split,
  BrainCircuit,
  ChartNoAxesCombined,
  Rocket,
  Check,
  CircleAlert,
} from 'lucide-react';
import type { Dataset, Job, Models } from './types';

export function WorkflowStepper({
  dataset,
  job,
  models,
  insufficient,
}: {
  dataset: Dataset | null;
  job: Job | null;
  models: Models | null;
  insufficient: boolean;
}) {
  const { t, steps } = usePageCopy();
  const events = job?.progress?.events ?? [];
  const latest = steps.findIndex((s) => s.key === job?.progress?.stage);
  const lastRecorded = Math.max(
    -1,
    ...events.map((e) => steps.findIndex((s) => s.key === e.stage)),
  );
  const active = Math.max(latest, lastRecorded);
  return (
    <ol className="ai-stepper" aria-label={t.trainingWorkflow}>
      {steps.map(({ key, label, Icon }, index) => {
        let state = 'waiting';
        let text = t.notStarted;
        if (key === 'DEPLOYMENT') {
          if (
            job &&
            (models?.active.model_version === job.modelVersion ||
              models?.deployments.some(
                (d) => d.modelVersion === job.modelVersion && d.status === 'COMPLETED',
              ))
          ) {
            state = 'done';
            text = t.deployed;
          } else if (job?.result)
            text =
              job.result.metadata.contains_synthetic || !job.result.metadata.activation_eligible
                ? t.notEligible
                : t.awaitingActivation;
        } else if (job) {
          if ((job.status === 'COMPLETED' && job.result) || index < active) {
            state = 'done';
            text = t.completed;
          } else if (index === active) {
            state =
              job.status === 'FAILED' ? 'failed' : job.status === 'RUNNING' ? 'running' : 'waiting';
            text =
              job.status === 'FAILED'
                ? t.failed
                : job.status === 'CANCELLED'
                  ? t.stopped
                  : job.status === 'RUNNING'
                    ? t.running
                    : t.notConfirmed;
          }
        } else if (index === 0 && dataset?.status === 'PUBLISHED') {
          state = 'done';
          text = t.dataFinalized;
        } else if (index === 0 && dataset?.summary && !dataset.summary.valid) {
          state = 'failed';
          text = t.dataCorrectionsRequired;
        }
        if (!job && index === 1 && insufficient) {
          state = 'warning';
          text = t.insufficientHistory;
        }
        return (
          <li
            key={key}
            className={`ai-step ${state}`}
            aria-current={state === 'running' ? 'step' : undefined}
          >
            <span className="ai-step-icon">
              {state === 'done' ? (
                <Check size={17} />
              ) : state === 'failed' ? (
                <CircleAlert size={17} />
              ) : (
                <Icon size={17} />
              )}
            </span>
            <strong>{label}</strong>
            <small>{text}</small>
          </li>
        );
      })}
    </ol>
  );
}

function usePageCopy() {
  const t = useScreen('workflow_stepper');
  const steps = [
    { key: 'DATA_COLLECTION', label: t.collect, Icon: Database },
    { key: 'EDA', label: t.exploreData, Icon: ScanSearch },
    { key: 'FEATURES', label: t.feature, Icon: Layers },
    { key: 'SPLITTING', label: t.splitData, Icon: Split },
    { key: 'TRAINING', label: t.train, Icon: BrainCircuit },
    { key: 'EVALUATION', label: t.evaluate, Icon: ChartNoAxesCombined },
    { key: 'DEPLOYMENT', label: t.deploy, Icon: Rocket },
  ];
  return { t, steps };
}
