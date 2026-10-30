'use client';
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
  const [config, setConfig] = useState<Config | null>(null), [error, setError] = useState(''), [show, setShow] = useState(false), [dataset, setDataset] = useState<Dataset | null>(null);
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
  function training() { toggle(true); requestAnimationFrame(() => document.getElementById('ai-training')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  return <div className="page-content ai-page"><header className="ai-header"><div className="ai-title"><span className="ai-title-icon"><BrainCircuit size={25} /></span><div><h1>AI Center</h1><p>Dữ liệu, dự báo và câu trả lời cho cửa hàng.</p></div></div><label className="ai-toggle" title="Chỉ ẩn/hiện giao diện. Tác vụ và hội thoại vẫn được giữ nguyên."><input role="switch" aria-label="Hiển thị quy trình huấn luyện" aria-controls="ai-training" type="checkbox" checked={show} onChange={e => toggle(e.target.checked)} /><span>Hiển thị quy trình huấn luyện</span></label></header>
    <nav className="ai-workspace-nav" aria-label="Khu vực AI Center"><a href="#ai-data"><Database size={15} />Dữ liệu huấn luyện</a>{show && <a href="#ai-training"><ChartNoAxesCombined size={15} />Huấn luyện & kết quả</a>}<a href="#ai-chat"><MessagesSquare size={15} />Trợ lý kinh doanh</a></nav>
    <ErrorBox error={error} />{config ? <><div id="ai-data"><DataPanel user={user} config={config} onDataset={setDataset} onReady={training} /></div><div id="ai-training" hidden={!show} data-testid="training-workflow"><TrainingPanel user={user} dataset={dataset} /></div><div id="ai-chat"><ChatPanel user={user} config={config} /></div></> : !error && <p role="status">Đang tải AI Center…</p>}</div>;
}
export function AiCenterPage() { const { user } = useAuth(); if (!user || !['ADMIN','STORE_MANAGER'].includes(user.role)) return null; return <Workspace key={`${user.id}-${user.role}-${user.locationId}`} user={user} />; }
