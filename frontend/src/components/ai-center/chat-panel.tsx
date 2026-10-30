'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, ArrowUp, RefreshCw, Database, Bot, Sparkles, SlidersHorizontal, ChevronDown, History, Store, X, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth';
import type { ChatSession, Config, Source } from './types';
import { aiGet, aiPost, DataTable, dateText, ErrorBox, messageOf } from './shared';
type Status = { available: boolean; model: string; state: string; help: string };
// React text nodes escape HTML. Support only paragraphs, inline emphasis and code; no raw HTML, images or links.
function SafeText({ text }: { text: string }) { return <div className="ai-message-text">{text.split('\n').map((line,i) => <p key={i}>{line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,j) => part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2,-2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={j}>{part.slice(1,-1)}</code> : part)}</p>)}</div>; }
function availability(source: Source) {
  if (source.availability) return source.availability;
  // Older saved replies have no availability metadata; invoice count still distinguishes an empty query.
  if (source.tool === 'getSalesSummary' && Number(source.rows[0]?.['Hóa đơn']) === 0) return { state: 'NO_RECORDS', records: 0, firstDate: null, lastDate: null, message: `Không tìm thấy hóa đơn hoàn tất từ ${source.from} đến ${source.to} trong phạm vi ${source.scope}. Chưa đủ căn cứ kết luận doanh thu thực tế bằng 0. CSV huấn luyện không được dùng làm dữ liệu bán hàng.` };
  return undefined;
}
function SourceCard({ source }: { source: Source }) {
  const state = availability(source), empty = state?.state === 'NO_RECORDS';
  const key = source.tool === 'getSalesSummary' ? 'Doanh thu (VND)' : source.tool === 'getExpenseSummary' ? 'Chi phí (VND)' : null;
  const amount = key ? source.rows[0]?.[key] : undefined;
  const monetary = typeof amount === 'string' || typeof amount === 'number' ? Number(amount) : NaN;
  return <details className={`ai-source ${empty ? 'is-empty' : ''}`}><summary><Database size={13} />{source.label}<span>{empty ? 'Chưa có bản ghi trong kỳ' : 'Xem nguồn'}</span></summary><div className="ai-source-content"><p className="field-hint">{source.scope}{source.from && ` · ${source.from} → ${source.to}`} · {dateText(source.asOf)}</p>{!empty && Number.isFinite(monetary) && <p><strong>{monetary.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ₫</strong> · {key}</p>}{empty ? <p>{state?.lastDate ? `Bản ghi gần nhất: ${state.lastDate}. Hãy đổi khoảng ngày hoặc kiểm tra dữ liệu đã nhập.` : 'Chưa có bản ghi phù hợp. Kiểm tra ngày, cửa hàng và dữ liệu tại trang Nhập dữ liệu.'} Không đủ căn cứ kết luận doanh thu thực tế bằng 0.</p> : <DataTable rows={source.rows} />}<p className="field-hint">{source.kind} · {source.tool}</p>{source.note && <p className="field-hint">{source.note}</p>}</div></details>;
}
function replyText(message: NonNullable<ChatSession['messages']>[number]) {
  const sources = message.sources ?? [];
  return message.role !== 'USER' && sources.length && sources.every(s => availability(s)?.state === 'NO_RECORDS') ? [...new Set(sources.map(s => availability(s)!.message))].join('\n') : message.content;
}
export function ChatPanel({ user, config }: { user: CurrentUser; config: Config }) {
  const [status, setStatus] = useState<Status | null>(null), [sessions, setSessions] = useState<ChatSession[]>([]), [session, setSession] = useState<ChatSession | null>(null), [location, setLocation] = useState(user.locationId ?? '');
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState('');
  const [below, setBelow] = useState(false), [menu, setMenu] = useState(false), [panel, setPanel] = useState<'suggestions' | 'history' | 'scope' | 'source' | null>(null);
  const tools = useRef<HTMLDivElement>(null), toolsButton = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null), nearBottom = useRef(true), currentRequest = useRef(0), sending = useRef(false);
  const refresh = useCallback(async () => { const [a,b] = await Promise.all([aiGet<Status>('/chat/status'), aiGet<{items: ChatSession[]}>('/chat/sessions')]); setStatus(a); setSessions(b.items); }, []);
  useEffect(() => { let cancelled = false; void Promise.all([aiGet<Status>('/chat/status'), aiGet<{items: ChatSession[]}>('/chat/sessions')]).then(([a,b]) => { if (!cancelled) { setStatus(a); setSessions(b.items); } }).catch(e => { if (!cancelled) setError(messageOf(e)); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [session?.messages, pending]);
  useEffect(() => { const el = composer.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(160, Math.max(44, el.scrollHeight))}px`; } }, [input]);
  useEffect(() => {
    if (!menu) return;
    tools.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const close = (event: PointerEvent) => { if (!tools.current?.contains(event.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  const stores = user.role === 'ADMIN' ? config.stores : config.stores.filter(s => s.id === user.locationId);
  const scope = stores.find(s => s.id === location)?.name ?? (user.role === 'ADMIN' && !location ? 'Toàn hệ thống' : user.location?.name ?? 'Cửa hàng được phân quyền');
  const suggestions = [
    ['Doanh thu 7 ngày', 'Doanh thu 7 ngày gần nhất là bao nhiêu?'],
    ['Sản phẩm bán chạy', 'Top 5 sản phẩm bán chạy tháng này?'],
    ['Cảnh báo tồn kho', 'Những sản phẩm nào đang có cảnh báo sắp hết hàng?'],
    ['Dự báo tuần tới', 'Cho tôi dự báo đã lưu cho 7 ngày tới.'],
  ];
  function suggest(value: string) { setInput(value); setPanel(null); composer.current?.focus(); }
  function newChat() { currentRequest.current++; setSession(null); setInput(''); setError(''); setPanel(null); composer.current?.focus(); }
  async function select(id: string) { const request = ++currentRequest.current; setError(''); setBusy(true); try { const data = await aiGet<ChatSession>(`/chat/sessions/${id}`); if (request === currentRequest.current) { setSession(data); setLocation(data.locationId ?? ''); nearBottom.current = true; } } catch(e) { if (request === currentRequest.current) setError(messageOf(e)); } finally { if (request === currentRequest.current) setBusy(false); } }
  async function send() {
    const value = input.trim(); if (sending.current || busy || !value || !status?.available) return; sending.current = true;
    setBusy(true); setError(''); setPending(value); nearBottom.current = true;
    try { let target = session; if (!target) { target = await aiPost<ChatSession>('/chat/sessions', { locationId: location || null }); setSession(target); }
      const result = await aiPost<ChatSession>(`/chat/sessions/${target.id}/messages`, { message: value }); setSession(result); setInput(''); setPending(''); await refresh();
    } catch(e) { setError(messageOf(e)); } finally { sending.current = false; setBusy(false); setPending(''); }
  }
  return <section className="ai-section ai-chat" aria-labelledby="ai-chat-title">
    <header className="ai-chat-header"><div className="ai-row"><span className="ai-chat-avatar"><Bot size={23} /></span><div><h2 id="ai-chat-title">Trợ lý kinh doanh</h2><div className="ai-model-status"><span className={`ai-dot ${status?.available ? 'ready' : ''}`} /><span title={status?.model}>{status ? status.available ? 'Sẵn sàng' : 'Chưa kết nối' : 'Đang kết nối…'}</span><span>· {scope}</span></div></div></div><div className="ai-row ai-chat-actions"><button className="ai-icon-button" type="button" title="Kiểm tra kết nối" aria-label="Kiểm tra kết nối" disabled={busy} onClick={() => { setError(''); void refresh().catch(e => setError(messageOf(e))); }}><RefreshCw size={16} /></button><button className="ai-icon-button" type="button" title="Lịch sử hội thoại" aria-label="Lịch sử hội thoại" aria-expanded={panel === 'history'} disabled={busy} onClick={() => setPanel(panel === 'history' ? null : 'history')}><History size={18} /></button><button className="ai-icon-button" type="button" title="Hội thoại mới" aria-label="Hội thoại mới" disabled={busy} onClick={newChat}><MessageSquarePlus size={18} /></button></div></header>
    {status && !status.available && <p className="ai-notice" role="status">{status.help}</p>}
    {panel && <div className="ai-chat-tool-panel" role="region" aria-label="Tùy chọn hội thoại"><div className="ai-row ai-between"><strong>{{suggestions:'Câu hỏi gợi ý',history:'Lịch sử hội thoại',scope:'Phạm vi dữ liệu',source:'Nguồn dữ liệu'}[panel]}</strong><button type="button" className="ai-icon-button" aria-label="Đóng tùy chọn" onClick={() => { setPanel(null); toolsButton.current?.focus(); }}><X size={16} /></button></div>
      {panel === 'suggestions' && <div className="ai-suggestions">{suggestions.map(([label,q]) => <button type="button" key={label} disabled={busy} onClick={() => suggest(q)}>{label}</button>)}</div>}
      {panel === 'history' && <label className="form-field">Hội thoại của tôi<select aria-label="Hội thoại của tôi" value={session?.id ?? ''} disabled={busy} onChange={e => { if (e.target.value) { void select(e.target.value); setPanel(null); } else newChat(); }}><option value="">Hội thoại mới</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>{!sessions.length && <span className="field-hint">Chưa có hội thoại đã lưu.</span>}</label>}
      {panel === 'scope' && <label className="form-field">Phạm vi hội thoại<select aria-label="Phạm vi hội thoại" disabled={busy || !!session || user.role !== 'ADMIN'} value={location} onChange={e => setLocation(e.target.value)}>{user.role === 'ADMIN' && <option value="">Toàn hệ thống</option>}{stores.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select><span className="field-hint">{session ? 'Phạm vi của hội thoại đã được cố định. Tạo hội thoại mới để chọn cửa hàng khác.' : user.role === 'ADMIN' ? 'Câu trả lời chỉ dùng dữ liệu thuộc phạm vi này.' : 'Chỉ sử dụng dữ liệu cửa hàng được phân quyền.'}</span></label>}
      {panel === 'source' && <div className="ai-chat-data-note"><p>Trợ lý đọc dữ liệu nghiệp vụ và dự báo đã lưu. CSV huấn luyện không tự trở thành dữ liệu bán hàng.</p><p>Để hỏi số liệu mẫu, nhập bộ <code>datasets/chatbot-business</code> tại <Link className="ai-link" href="/imports">Nhập dữ liệu</Link>, rồi hỏi kỳ 05/10–18/10/2026.</p><p className="field-hint">{status?.model} · {scope}. Nguồn đối chiếu nằm dưới từng câu trả lời.</p></div>}
    </div>}
    <div className="ai-chat-log" role="log" aria-label="Nội dung hội thoại" aria-live="polite" ref={scroll} onScroll={() => { const el = scroll.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
      {!session?.messages?.length && !pending && <div className="ai-chat-empty"><Sparkles size={26} /><h3>Hôm nay bạn muốn phân tích gì?</h3><p>Hỏi về doanh thu, sản phẩm, tồn kho hoặc dự báo.</p><div className="ai-suggestions">{suggestions.map(([label,q]) => <button type="button" key={label} disabled={busy} onClick={() => suggest(q)}>{label}<span aria-hidden="true">↗</span></button>)}</div></div>}
      {session?.messages?.map(m => <article key={m.id} className={`ai-message ${m.role === 'USER' ? 'user' : 'assistant'}`}><div className="ai-message-meta"><strong title={dateText(m.createdAt)}>{m.role === 'USER' ? 'Bạn' : 'Trợ lý RetailSense'}</strong></div><SafeText text={replyText(m)} />{m.sources?.map((s,i) => <SourceCard key={i} source={s} />)}</article>)}
      {pending && <><article className="ai-message user"><strong>Bạn</strong><SafeText text={pending} /></article><p className="ai-thinking" role="status">Đang đọc nguồn dữ liệu và chuẩn bị phản hồi…</p></>}
    </div><ErrorBox error={error} />
    <form className="ai-composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea ref={composer} id="ai-question" aria-label="Câu hỏi của bạn" aria-describedby="ai-composer-help" value={input} disabled={busy} maxLength={2000} rows={1} placeholder="Bạn muốn biết gì về cửa hàng?" onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><div className="ai-row ai-between"><div className="ai-tools" ref={tools} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu(false); }} onKeyDown={e => { if (e.key === 'Escape') { setMenu(false); toolsButton.current?.focus(); } if (menu && ['ArrowDown','ArrowUp','Home','End'].includes(e.key)) { e.preventDefault(); const entries = Array.from(tools.current!.querySelectorAll<HTMLButtonElement>('[role=menuitem]')); const index = entries.indexOf(document.activeElement as HTMLButtonElement); entries[e.key === 'Home' ? 0 : e.key === 'End' ? entries.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus(); } }}><button ref={toolsButton} className="ai-tools-button" type="button" aria-haspopup="menu" aria-expanded={menu} aria-controls="ai-tools-menu" onClick={() => { setBelow((toolsButton.current?.getBoundingClientRect().top ?? 0) < 220); setMenu(!menu); }}><SlidersHorizontal size={16} />Công cụ<ChevronDown size={14} /></button>{menu && <div id="ai-tools-menu" className={`ai-tools-menu ${below ? 'below' : ''}`} role="menu" aria-label="Công cụ hội thoại">{([{key:'suggestions',label:'Câu hỏi gợi ý',Icon:MessageCircle},{key:'history',label:'Lịch sử hội thoại',Icon:History}, ...(user.role === 'ADMIN' ? [{key:'scope',label:'Phạm vi cửa hàng',Icon:Store}] : []),{key:'source',label:'Nguồn dữ liệu',Icon:Database}] as const).map(({key,label,Icon}) => <button type="button" role="menuitem" key={key} onClick={() => { setPanel(key as typeof panel); setMenu(false); toolsButton.current?.focus(); }}><Icon size={16} />{label}</button>)}</div>}</div><button className="ai-send" aria-label={busy ? 'Đang trả lời' : 'Gửi câu hỏi'} title={busy ? 'Đang trả lời…' : 'Gửi câu hỏi'} disabled={busy || !input.trim() || !status?.available}><ArrowUp size={21} /></button></div></form><div className="ai-composer-footnote" id="ai-composer-help"><span>Enter để gửi · Shift+Enter xuống dòng</span><span>{input.length}/2.000</span></div>
  </section>;
}
