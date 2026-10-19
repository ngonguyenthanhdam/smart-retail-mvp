'use client';
import { useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import type { Config, Dataset } from './types';
import { aiGet, ErrorBox, messageOf } from './shared';
import { DataPanel } from './data-panel';
import { TrainingPanel } from './training-panel';
import { ChatPanel } from './chat-panel';
import './ai-center.css';

function Workspace({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const [config, setConfig] = useState<Config | null>(null), [error, setError] = useState(''), [show, setShow] = useState(true), [dataset, setDataset] = useState<Dataset | null>(null);
  useEffect(() => {
    let cancelled = false;
    void aiGet<Config>('/config').then(value => {
      if (cancelled) return;
      setConfig(value);
      // Restore the preference before mounting panels; this never writes to the server.
      try { const saved = localStorage.getItem(`retailsense.training-visible.${user.id}`); if (saved !== null) setShow(saved !== 'false'); } catch { /* Storage is optional in private browsers. */ }
    }).catch(e => { if (!cancelled) setError(messageOf(e)); });
    return () => { cancelled = true; };
  }, [user.id]);
  function toggle(value: boolean) { setShow(value); try { localStorage.setItem(`retailsense.training-visible.${user.id}`, String(value)); } catch { /* Keep the in-memory preference. */ } }
  return <div className="page-content ai-page"><header className="ai-header"><div><span className="ai-eyebrow"><BrainCircuit size={18} />RETAILSENSE</span><h1>AI Center</h1><p>Chuẩn bị dữ liệu, đánh giá mô hình và trao đổi với trợ lý kinh doanh.</p></div><label className="ai-toggle"><input role="switch" aria-label="Hiển thị quy trình huấn luyện" type="checkbox" checked={show} onChange={e => toggle(e.target.checked)} /><span>Hiển thị quy trình huấn luyện<small>Chỉ thay đổi phần hiển thị</small></span></label></header><ErrorBox error={error} />{config ? <><DataPanel user={user} config={config} onDataset={setDataset} /><div hidden={!show} data-testid="training-workflow"><TrainingPanel user={user} dataset={dataset} /></div><ChatPanel user={user} config={config} /></> : !error && <p role="status">Đang tải AI Center…</p>}</div>;
}
export function AiCenterPage() { const { user } = useAuth(); if (!user || !['ADMIN','STORE_MANAGER'].includes(user.role)) return null; return <Workspace key={`${user.id}-${user.role}-${user.locationId}`} user={user} />; }
