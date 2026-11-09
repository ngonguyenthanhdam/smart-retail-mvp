'use client';
import { useScreen } from '@/i18n/provider';
import { useEffect, useState } from 'react';
import { BrainCircuit, Database, ChartNoAxesCombined, MessagesSquare } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import type { Config, Dataset } from './types';
import { aiGet, ErrorBox, messageOf } from './shared';
import { DataPanel } from './data-panel';
import { TrainingPanel } from './training-panel';
import { ChatPanel } from './chat-panel';
import './ai-center.css';

function Workspace({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const { t } = usePageCopy();
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState('');
  const [showTraining, setShowTraining] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  useEffect(() => {
    let cancelled = false;
    void aiGet<Config>('/config')
      .then((value) => {
        if (cancelled) return;
        setConfig(value);

        try {
          const saved = localStorage.getItem(`retailsense.training-visible.${user.id}`);
          if (saved !== null) setShowTraining(saved !== 'false');
        } catch {}
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);
  function setTrainingVisible(value: boolean) {
    setShowTraining(value);
    try {
      localStorage.setItem(`retailsense.training-visible.${user.id}`, String(value));
    } catch {}
  }
  function openTraining() {
    setTrainingVisible(true);
    requestAnimationFrame(() =>
      document
        .getElementById('ai-training')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }
  return (
    <div className="page-content ai-page">
      <header className="ai-header">
        <div className="ai-title">
          <span className="ai-title-icon">
            <BrainCircuit size={25} />
          </span>
          <div>
            <h1>AI Center</h1>
            <p>{t.dataForecastsAndAnswersForYourStore}</p>
          </div>
        </div>
        <label className="ai-toggle" title={t.onlyChangesVisibilityTasksAndConversationsAre}>
          <input
            role="switch"
            aria-label={t.showTheTrainingWorkflow}
            aria-controls="ai-training"
            type="checkbox"
            checked={showTraining}
            onChange={(e) => setTrainingVisible(e.target.checked)}
          />
          <span>{t.showTheTrainingWorkflow}</span>
        </label>
      </header>
      <nav className="ai-workspace-nav" aria-label={t.aiCenterSections}>
        <a href="#ai-data">
          <Database size={15} />
          {t.trainingData}
        </a>
        {showTraining && (
          <a href="#ai-training">
            <ChartNoAxesCombined size={15} />
            {t.trainingResults}
          </a>
        )}
        <a href="#ai-chat">
          <MessagesSquare size={15} />
          {t.businessAssistant}
        </a>
      </nav>
      <ErrorBox error={error} />
      {config ? (
        <>
          <div id="ai-data">
            <DataPanel user={user} config={config} onDataset={setDataset} onReady={openTraining} />
          </div>
          <div id="ai-training" hidden={!showTraining} data-testid="training-workflow">
            <TrainingPanel user={user} dataset={dataset} />
          </div>
          <div id="ai-chat">
            <ChatPanel user={user} config={config} />
          </div>
        </>
      ) : (
        !error && <p role="status">{t.loadingAiCenter}</p>
      )}
    </div>
  );
}
export function AiCenterPage() {
  const { user } = useAuth();
  if (!user || !['ADMIN', 'STORE_MANAGER'].includes(user.role)) return null;
  return <Workspace key={`${user.id}-${user.role}-${user.locationId}`} user={user} />;
}

function usePageCopy() {
  const t = useScreen('ai_center_page');

  return { t };
}
