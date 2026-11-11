'use client';
import { useMessages } from '@/i18n/provider';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { formatMoney } from '@/lib/format';
import { displayReportDate, type Dashboard } from './types';
import styles from './dashboard.module.css';

export function RevenueChart({ trend }: { trend: Dashboard['trend'] }) {
  const { c, d } = usePageCopy();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState<number | null>(null);
  const helpId = useId();
  const areaId = useId();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, Math.floor(entry.contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const peak = Math.max(1, ...trend.map((day) => Number(day.revenue)));
  const magnitude = 10 ** Math.floor(Math.log10(peak / 5));
  const step =
    ([1, 2, 2.5, 5, 10].find((value) => value * magnitude >= peak / 5) ?? 10) * magnitude;
  const divisions = Math.ceil(peak / step);
  const maximum = divisions * step;
  const left = Math.min(150, Math.max(92, formatMoney(maximum).length * 6));
  const right = width - 16;
  const bottom = 164;
  const top = 14;
  const x = (index: number) =>
    trend.length === 1
      ? (left + right) / 2
      : left + (index * (right - left)) / Math.max(1, trend.length - 1);
  const y = (value: string) => bottom - (Number(value) / maximum) * (bottom - top);
  const points = trend.map((day, index) => `${x(index)},${y(day.revenue)}`).join(' ');
  const activeIndex = selected === null ? trend.length - 1 : Math.min(selected, trend.length - 1);
  const active = trend[activeIndex];
  const labels = [...new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1])].filter(
    (index) => index >= 0,
  );

  return (
    <div className={styles.chartBody}>
      <div className={styles.chartReadout}>
        <span className={styles.legend}>
          <i aria-hidden="true" />
          {d.chartUnit}
        </span>
        {active && (
          <output htmlFor={helpId} aria-live="off">
            <span>{displayReportDate(active.date)}</span>
            <strong>{formatMoney(active.revenue)}</strong>
          </output>
        )}
      </div>
      <div ref={container} className={styles.chartCanvas}>
        <svg
          viewBox={`0 0 ${width} 196`}
          role="img"
          aria-label={c.trend}
          onPointerMove={(event) => {
            if (!trend.length) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const position = ((event.clientX - rect.left) * width) / rect.width;
            setSelected(
              Math.max(
                0,
                Math.min(
                  trend.length - 1,
                  Math.round(((position - left) / (right - left)) * (trend.length - 1)),
                ),
              ),
            );
          }}
        >
          <title>{c.trend}</title>
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ds-primary)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--ds-primary)" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          <desc>
            {d.chartUnit}.{' '}
            {trend.length
              ? `${displayReportDate(trend[0].date)} – ${displayReportDate(trend[trend.length - 1].date)}`
              : d.chartEmpty}
          </desc>
          {Array.from({ length: divisions + 1 }, (_, index) => index / divisions).map((ratio) => (
            <g key={ratio}>
              <line
                x1={left}
                x2={right}
                y1={bottom - ratio * (bottom - top)}
                y2={bottom - ratio * (bottom - top)}
                className={styles.chartGrid}
              />
              <text x={left - 9} y={bottom - ratio * (bottom - top) + 4} textAnchor="end">
                {formatMoney(maximum * ratio)}
              </text>
            </g>
          ))}
          {trend.length > 1 && (
            <polygon
              points={`${x(0)},${bottom} ${points} ${x(trend.length - 1)},${bottom}`}
              fill={`url(#${areaId})`}
            />
          )}
          <polyline points={points} fill="none" className={styles.chartLine} />
          {active && (
            <g>
              <line
                x1={x(activeIndex)}
                x2={x(activeIndex)}
                y1={top}
                y2={bottom}
                className={styles.chartCursor}
              />
              <circle
                cx={x(activeIndex)}
                cy={y(active.revenue)}
                r="4.5"
                className={styles.chartPoint}
              />
            </g>
          )}
          {labels.map((index, i) => (
            <text
              key={index}
              x={x(index)}
              y="190"
              textAnchor={
                trend.length === 1
                  ? 'middle'
                  : i === 0
                    ? 'start'
                    : i === labels.length - 1
                      ? 'end'
                      : 'middle'
              }
            >
              {displayReportDate(trend[index].date).slice(0, 5)}
            </text>
          ))}
        </svg>
      </div>
      {trend.length > 1 && (
        <div className={styles.chartControls}>
          <label className={styles.srOnly} htmlFor={helpId}>
            {d.chartExplore}
          </label>
          <input
            id={helpId}
            type="range"
            min={0}
            max={trend.length - 1}
            value={activeIndex}
            aria-valuetext={
              active
                ? `${displayReportDate(active.date)}: ${formatMoney(active.revenue)}`
                : undefined
            }
            aria-describedby={`${helpId}-hint`}
            onChange={(event) => setSelected(Number(event.target.value))}
          />
          <span id={`${helpId}-hint`} className={styles.srOnly}>
            {d.chartHelp}
          </span>
        </div>
      )}
      <details className={styles.dailyData}>
        <summary>
          {c.trendData}
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={c.trendData}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{c.date}</th>
                <th scope="col">{c.revenue}</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{displayReportDate(day.date)}</th>
                  <td>{formatMoney(day.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function usePageCopy() {
  const { reportCopy: c, dashboardCopy } = useMessages();
  const d = dashboardCopy;
  return { c, d };
}
