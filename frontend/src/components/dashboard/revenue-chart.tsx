'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { reportCopy as c } from '@/i18n/vi';
import { dashboardCopy } from '@/i18n/dashboard';
import { formatMoney } from '@/lib/format';
import { displayReportDate, type Dashboard } from './types';
import styles from './dashboard.module.css';

const d = dashboardCopy.vi;
const compactMoney = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

export function RevenueChart({ trend }: { trend: Dashboard['trend'] }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState<number | null>(null);
  const helpId = useId();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Numeric conversion is for plotting only. Exact API values retain the shared money formatter.
  const peak = Math.max(1, ...trend.map(day => Number(day.revenue)));
  const magnitude = 10 ** Math.floor(Math.log10(peak / 5));
  const step = ([1, 2, 2.5, 5, 10].find(value => value * magnitude >= peak / 5) ?? 10) * magnitude;
  const divisions = Math.ceil(peak / step);
  const maximum = divisions * step;
  const left = 46, right = width - 16, bottom = 202, top = 22;
  const x = (index: number) => trend.length === 1 ? (left + right) / 2 : left + index * (right - left) / Math.max(1, trend.length - 1);
  const y = (value: string) => bottom - Number(value) / maximum * (bottom - top);
  const points = trend.map((day, index) => `${x(index)},${y(day.revenue)}`).join(' ');
  const activeIndex = selected === null ? trend.length - 1 : Math.min(selected, trend.length - 1);
  const active = trend[activeIndex];
  const labels = [...new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1])].filter(index => index >= 0);

  return <div className={styles.chartBody}>
    <div className={styles.chartReadout}><span className={styles.legend}><i aria-hidden="true" />{d.chartUnit}</span>
      {active && <output htmlFor={helpId} aria-live="off"><span>{displayReportDate(active.date)}</span><strong>{formatMoney(active.revenue)}</strong></output>}
    </div>
    <div ref={container} className={styles.chartCanvas}>
      <svg viewBox={`0 0 ${width} 235`} role="img" aria-label={c.trend} onPointerMove={event => {
        if (!trend.length) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const position = (event.clientX - rect.left) * width / rect.width;
        setSelected(Math.max(0, Math.min(trend.length - 1, Math.round((position - left) / (right - left) * (trend.length - 1)))));
      }}>
        <title>{c.trend}</title><desc>{d.chartUnit}. {trend.length ? `${displayReportDate(trend[0].date)} – ${displayReportDate(trend[trend.length - 1].date)}` : d.chartEmpty}</desc>
        {Array.from({ length: divisions + 1 }, (_, index) => index / divisions).map(ratio => <g key={ratio}><line x1={left} x2={right} y1={bottom - ratio * (bottom - top)} y2={bottom - ratio * (bottom - top)} className={styles.chartGrid} /><text x={left - 9} y={bottom - ratio * (bottom - top) + 4} textAnchor="end">{compactMoney.format(maximum * ratio)}</text></g>)}
        {trend.length > 1 && <polygon points={`${x(0)},${bottom} ${points} ${x(trend.length - 1)},${bottom}`} className={styles.chartArea} />}
        <polyline points={points} fill="none" className={styles.chartLine} />
        {active && <g><line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={bottom} className={styles.chartCursor} /><circle cx={x(activeIndex)} cy={y(active.revenue)} r="4.5" className={styles.chartPoint} /></g>}
        {labels.map((index, i) => <text key={index} x={x(index)} y="226" textAnchor={trend.length === 1 ? 'middle' : i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{displayReportDate(trend[index].date).slice(0, 5)}</text>)}
      </svg>
    </div>
    {trend.length > 1 && <div className={styles.chartControls}><label className={styles.srOnly} htmlFor={helpId}>{d.chartExplore}</label>
      <input id={helpId} type="range" min={0} max={trend.length - 1} value={activeIndex} aria-valuetext={active ? `${displayReportDate(active.date)}: ${formatMoney(active.revenue)}` : undefined} aria-describedby={`${helpId}-hint`} onChange={event => setSelected(Number(event.target.value))} />
      <span id={`${helpId}-hint`} className={styles.srOnly}>{d.chartHelp}</span>
    </div>}
    <details className={styles.dailyData}><summary>{c.trendData}<ChevronDown size={15} aria-hidden="true" /></summary>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={c.trendData}><table className={styles.table}><thead><tr><th scope="col">{c.date}</th><th scope="col">{c.revenue}</th></tr></thead><tbody>{trend.map(day => <tr key={day.date}><th scope="row">{displayReportDate(day.date)}</th><td>{formatMoney(day.revenue)}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}
