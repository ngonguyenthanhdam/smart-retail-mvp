'use client';
import { useFormatters } from '@/i18n/formatters';
import { formatMoney } from '@/lib/format';
import { sourceColumns, sourceTitles } from '@/i18n/source-columns';
import { useLocale } from '@/i18n/provider';
import { useDynamic } from '@/i18n/dynamic';
import { useScreen } from '@/i18n/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquarePlus,
  ArrowUp,
  RefreshCw,
  Database,
  Bot,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  History,
  Store,
  X,
  MessageCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth';
import type { ChatSession, Config, Source } from './types';
import { aiGet, aiPost, DataTable, ErrorBox, messageOf } from './shared';
type Status = { available: boolean; model: string; state: string; help: string };

function SafeText({ text }: { text: string }) {
  return (
    <div className="ai-message-text">
      {text.split('\n').map((line, i) => (
        <p key={i}>
          {line
            .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
            .map((part, j) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : part.startsWith('`') && part.endsWith('`') ? (
                <code key={j}>{part.slice(1, -1)}</code>
              ) : (
                part
              ),
            )}
        </p>
      ))}
    </div>
  );
}
function availability(dynamic: ReturnType<typeof useDynamic>, source: Source) {
  if (source.availability) return source.availability;

  if (source.tool === 'getSalesSummary' && Number(source.rows[0]?.['Hóa đơn']) === 0)
    return {
      state: 'NO_RECORDS',
      records: 0,
      firstDate: null,
      lastDate: null,
      message: dynamic.noInvoices(source.from, source.to, source.scope),
    };
  return undefined;
}
function SourceCard({ source }: { source: Source }) {
  const { locale } = useLocale();
  const columns = sourceColumns(source.tool, locale);
  const { dateText } = useFormatters();
  const dynamic = useDynamic();
  const { t } = usePageCopy();
  const state = availability(dynamic, source);
  const empty = state?.state === 'NO_RECORDS';
  const key =
    source.tool === 'getSalesSummary'
      ? 'Doanh thu (VND)'
      : source.tool === 'getExpenseSummary'
        ? 'Chi phí (VND)'
        : null;
  const amount = key ? source.rows[0]?.[key] : undefined;
  const monetary = typeof amount === 'string' || typeof amount === 'number' ? Number(amount) : NaN;
  return (
    <details className={`ai-source ${empty ? 'is-empty' : ''}`}>
      <summary>
        <Database size={13} />
        {sourceTitles[source.tool]?.[locale] ?? source.label}
        <span>{empty ? t.noRecordsInThisPeriod : t.viewSource}</span>
      </summary>
      <div className="ai-source-content">
        <p className="field-hint">
          {source.scope}
          {source.from && ` · ${source.from} → ${source.to}`} · {dateText(source.asOf)}
        </p>
        {!empty && Number.isFinite(monetary) && (
          <p>
            <strong>{formatMoney(amount as string | number)}</strong> ·{' '}
            {key ? (columns[key]?.label ?? key) : null}
          </p>
        )}
        {empty ? (
          <p>
            {state?.lastDate
              ? dynamic.latestRecord(state.lastDate)
              : t.noMatchingRecordsCheckTheDatesStore}{' '}
            {t.thereIsNotEnoughEvidenceToConclude}
          </p>
        ) : (
          <DataTable rows={source.rows} columns={columns} />
        )}
        <p className="field-hint">
          {source.kind} · {source.tool}
        </p>
        {source.note && <p className="field-hint">{source.note}</p>}
      </div>
    </details>
  );
}
function replyText(
  dynamic: ReturnType<typeof useDynamic>,
  message: NonNullable<ChatSession['messages']>[number],
) {
  const sources = message.sources ?? [];
  return message.role !== 'USER' &&
    sources.length &&
    sources.every((s) => availability(dynamic, s)?.state === 'NO_RECORDS')
    ? [...new Set(sources.map((s) => availability(dynamic, s)!.message))].join('\n')
    : message.content;
}
export function ChatPanel({ user, config }: { user: CurrentUser; config: Config }) {
  const { dateText } = useFormatters();
  const dynamic = useDynamic();
  const { t } = usePageCopy();
  const [status, setStatus] = useState<Status | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [location, setLocation] = useState(user.locationId ?? '');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [below, setBelow] = useState(false);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<'suggestions' | 'history' | 'scope' | 'source' | null>(null);
  const tools = useRef<HTMLDivElement>(null);
  const toolsButton = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const currentRequest = useRef(0);
  const sending = useRef(false);
  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([
      aiGet<Status>('/chat/status'),
      aiGet<{ items: ChatSession[] }>('/chat/sessions'),
    ]);
    setStatus(a);
    setSessions(b.items);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      aiGet<Status>('/chat/status'),
      aiGet<{ items: ChatSession[] }>('/chat/sessions'),
    ])
      .then(([a, b]) => {
        if (!cancelled) {
          setStatus(a);
          setSessions(b.items);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (nearBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [session?.messages, pending]);
  useEffect(() => {
    const el = composer.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(160, Math.max(44, el.scrollHeight))}px`;
    }
  }, [input]);
  useEffect(() => {
    if (!menu) return;
    tools.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const close = (event: PointerEvent) => {
      if (!tools.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  const stores =
    user.role === 'ADMIN' ? config.stores : config.stores.filter((s) => s.id === user.locationId);
  const scope =
    stores.find((s) => s.id === location)?.name ??
    (user.role === 'ADMIN' && !location ? t.allStores : (user.location?.name ?? t.assignedStore));
  const suggestions = [
    [t.label7DayRevenue, t.whatWasRevenueOverTheLast7],
    [t.bestSellingProducts, t.whatAreTheTop5BestSelling],
    [t.inventoryAlerts, t.whichProductsHaveLowStockAlerts],
    [t.nextWeekSForecast, t.showMeTheSavedForecastForThe],
  ];
  function suggest(value: string) {
    setInput(value);
    setPanel(null);
    composer.current?.focus();
  }
  function newChat() {
    currentRequest.current++;
    setSession(null);
    setInput('');
    setError('');
    setPanel(null);
    composer.current?.focus();
  }
  async function select(id: string) {
    const request = ++currentRequest.current;
    setError('');
    setBusy(true);
    try {
      const data = await aiGet<ChatSession>(`/chat/sessions/${id}`);
      if (request === currentRequest.current) {
        setSession(data);
        setLocation(data.locationId ?? '');
        nearBottom.current = true;
      }
    } catch (e) {
      if (request === currentRequest.current) setError(messageOf(e));
    } finally {
      if (request === currentRequest.current) setBusy(false);
    }
  }
  async function send() {
    const value = input.trim();
    if (sending.current || busy || !value || !status?.available) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setPending(value);
    nearBottom.current = true;
    try {
      let target = session;
      if (!target) {
        target = await aiPost<ChatSession>('/chat/sessions', { locationId: location || null });
        setSession(target);
      }
      const result = await aiPost<ChatSession>(`/chat/sessions/${target.id}/messages`, {
        message: value,
      });
      setSession(result);
      setInput('');
      setPending('');
      await refresh();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      sending.current = false;
      setBusy(false);
      setPending('');
    }
  }
  return (
    <section className="ai-section ai-chat" aria-labelledby="ai-chat-title">
      <header className="ai-chat-header">
        <div className="ai-row">
          <span className="ai-chat-avatar">
            <Bot size={23} />
          </span>
          <div>
            <h2 id="ai-chat-title">{t.businessAssistant}</h2>
            <div className="ai-model-status">
              <span className={`ai-dot ${status?.available ? 'ready' : ''}`} />
              <span title={status?.model}>
                {status ? (status.available ? t.ready : t.disconnected) : t.connecting}
              </span>
              <span>· {scope}</span>
            </div>
          </div>
        </div>
        <div className="ai-row ai-chat-actions">
          <button
            className="ai-icon-button"
            type="button"
            title={t.checkConnection}
            aria-label={t.checkConnection}
            disabled={busy}
            onClick={() => {
              setError('');
              void refresh().catch((e) => setError(messageOf(e)));
            }}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="ai-icon-button"
            type="button"
            title={t.conversationHistory}
            aria-label={t.conversationHistory}
            aria-expanded={panel === 'history'}
            disabled={busy}
            onClick={() => setPanel(panel === 'history' ? null : 'history')}
          >
            <History size={18} />
          </button>
          <button
            className="ai-icon-button"
            type="button"
            title={t.newConversation}
            aria-label={t.newConversation}
            disabled={busy}
            onClick={newChat}
          >
            <MessageSquarePlus size={18} />
          </button>
        </div>
      </header>
      {status && !status.available && (
        <p className="ai-notice" role="status">
          {status.help}
        </p>
      )}
      {panel && (
        <div className="ai-chat-tool-panel" role="region" aria-label={t.conversationOptions}>
          <div className="ai-row ai-between">
            <strong>
              {
                {
                  suggestions: t.suggestedQuestions,
                  history: t.conversationHistory,
                  scope: t.dataScope,
                  source: t.dataSources,
                }[panel]
              }
            </strong>
            <button
              type="button"
              className="ai-icon-button"
              aria-label={t.closeOptions}
              onClick={() => {
                setPanel(null);
                toolsButton.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
          {panel === 'suggestions' && (
            <div className="ai-suggestions">
              {suggestions.map(([label, q]) => (
                <button type="button" key={label} disabled={busy} onClick={() => suggest(q)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {panel === 'history' && (
            <label className="form-field">
              {t.myConversations}
              <select
                aria-label={t.myConversations}
                value={session?.id ?? ''}
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) {
                    void select(e.target.value);
                    setPanel(null);
                  } else newChat();
                }}
              >
                <option value="">{t.newConversation}</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              {!sessions.length && <span className="field-hint">{t.noSavedConversationsYet}</span>}
            </label>
          )}
          {panel === 'scope' && (
            <label className="form-field">
              {t.conversationScope}
              <select
                aria-label={t.conversationScope}
                disabled={busy || !!session || user.role !== 'ADMIN'}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                {user.role === 'ADMIN' && <option value="">{t.allStores}</option>}
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {session
                  ? t.theScopeOfThisConversationIsFixed
                  : user.role === 'ADMIN'
                    ? t.answersOnlyUseDataWithinThisScope
                    : t.onlyDataFromYourAssignedStoreIs}
              </span>
            </label>
          )}
          {panel === 'source' && (
            <div className="ai-chat-data-note">
              <p>{t.theAssistantReadsBusinessRecordsAndSaved}</p>
              <p>
                {t.toAskAboutSampleFiguresImportThe} <code>datasets/chatbot-business</code> {t.at}{' '}
                <Link className="ai-link" href="/imports">
                  {t.importData}
                </Link>
                {t.thenAskAbout518October2026}
              </p>
              <p className="field-hint">
                {status?.model} · {scope}
                {t.supportingSourcesAppearBelowEachAnswer}
              </p>
            </div>
          )}
        </div>
      )}
      <div
        className="ai-chat-log"
        role="log"
        aria-label={t.conversationContent}
        aria-live="polite"
        ref={scroll}
        onScroll={() => {
          const el = scroll.current;
          if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        {!session?.messages?.length && !pending && (
          <div className="ai-chat-empty">
            <Sparkles size={26} />
            <h3>{t.whatWouldYouLikeToAnalyzeToday}</h3>
            <p>{t.askAboutRevenueProductsInventoryOrForecasts}</p>
            <div className="ai-suggestions">
              {suggestions.map(([label, q]) => (
                <button type="button" key={label} disabled={busy} onClick={() => suggest(q)}>
                  {label}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {session?.messages?.map((m) => (
          <article key={m.id} className={`ai-message ${m.role === 'USER' ? 'user' : 'assistant'}`}>
            <div className="ai-message-meta">
              <strong title={dateText(m.createdAt)}>
                {m.role === 'USER' ? t.you : t.retailsenseAssistant}
              </strong>
            </div>
            <SafeText text={replyText(dynamic, m)} />
            {m.sources?.map((s, i) => (
              <SourceCard key={i} source={s} />
            ))}
          </article>
        ))}
        {pending && (
          <>
            <article className="ai-message user">
              <strong>{t.you}</strong>
              <SafeText text={pending} />
            </article>
            <p className="ai-thinking" role="status">
              {t.readingDataSourcesAndPreparingAResponse}
            </p>
          </>
        )}
      </div>
      <ErrorBox error={error} />
      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={composer}
          id="ai-question"
          aria-label={t.yourQuestion}
          aria-describedby="ai-composer-help"
          value={input}
          disabled={busy}
          maxLength={2000}
          rows={1}
          placeholder={t.whatWouldYouLikeToKnowAbout}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="ai-row ai-between">
          <div
            className="ai-tools"
            ref={tools}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setMenu(false);
                toolsButton.current?.focus();
              }
              if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const entries = Array.from(
                  tools.current!.querySelectorAll<HTMLButtonElement>('[role=menuitem]'),
                );
                const index = entries.indexOf(document.activeElement as HTMLButtonElement);
                entries[
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? entries.length - 1
                      : (index + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length
                ]?.focus();
              }
            }}
          >
            <button
              ref={toolsButton}
              className="ai-tools-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-controls="ai-tools-menu"
              onClick={() => {
                setBelow((toolsButton.current?.getBoundingClientRect().top ?? 0) < 220);
                setMenu(!menu);
              }}
            >
              <SlidersHorizontal size={16} />
              {t.tools}
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div
                id="ai-tools-menu"
                className={`ai-tools-menu ${below ? 'below' : ''}`}
                role="menu"
                aria-label={t.conversationTools}
              >
                {(
                  [
                    { key: 'suggestions', label: t.suggestedQuestions, Icon: MessageCircle },
                    { key: 'history', label: t.conversationHistory, Icon: History },
                    ...(user.role === 'ADMIN'
                      ? [{ key: 'scope', label: t.storeScope, Icon: Store }]
                      : []),
                    { key: 'source', label: t.dataSources, Icon: Database },
                  ] as const
                ).map(({ key, label, Icon }) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={key}
                    onClick={() => {
                      setPanel(key as typeof panel);
                      setMenu(false);
                      toolsButton.current?.focus();
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="ai-send"
            aria-label={busy ? t.responding : t.sendQuestion}
            title={busy ? t.responding2 : t.sendQuestion}
            disabled={busy || !input.trim() || !status?.available}
          >
            <ArrowUp size={21} />
          </button>
        </div>
      </form>
      <div className="ai-composer-footnote" id="ai-composer-help">
        <span>{t.enterToSendShiftEnterForA}</span>
        <span>{input.length}/2.000</span>
      </div>
    </section>
  );
}

function usePageCopy() {
  const t = useScreen('chat_panel');

  return { t };
}
