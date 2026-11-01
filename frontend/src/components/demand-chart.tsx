'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ForecastDetail } from '@/lib/forecasts';
import { formatQuantity } from '@/lib/format';

export function DemandChart({
  series,
  name,
}: {
  series: NonNullable<ForecastDetail['dailySeries']>[number];
  name: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState<number | null>(null);
  const sliderId = useId();
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, Math.floor(entry.contentRect.width))),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const historical = series.history ?? [];
  const all = [...historical, ...series.daily];
  const max = Math.max(1, ...all.map((point) => point.quantity));
  const left = 46;
  const right = width - 16;
  const x = (index: number) =>
    all.length === 1
      ? (left + right) / 2
      : left + (index * (right - left)) / Math.max(1, all.length - 1);
  const y = (value: number) => 190 - (value * 155) / max;
  const path = (rows: typeof all, offset = 0) =>
    rows.map((point, index) => `${x(index + offset)},${y(point.quantity)}`).join(' ');
  const activeIndex = Math.max(0, Math.min(selected ?? historical.length, all.length - 1));
  const active = all[activeIndex];
  const activeKind = activeIndex < historical.length ? 'Đã bán' : 'Dự kiến';
  return (
    <div className="demand-chart">
      <div className="chart-legend">
        <span>
          <i aria-hidden="true" />
          Đã bán
        </span>
        <span>
          <i aria-hidden="true" />
          Dự kiến
        </span>
        <small>{name} · theo ngày</small>
      </div>
      <div className="demand-chart-readout">
        <output htmlFor={sliderId}>
          {active
            ? `${active.date} · ${activeKind}: ${formatQuantity(active.quantity)}`
            : 'Chưa có điểm dữ liệu'}
        </output>
      </div>
      <div ref={container} className="demand-chart-canvas">
        <svg
          viewBox={`0 0 ${width} 225`}
          role="img"
          aria-label={`Lịch sử và lượng bán dự kiến mỗi ngày của ${name}`}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const position = ((event.clientX - bounds.left) * width) / bounds.width;
            setSelected(
              Math.max(
                0,
                Math.min(
                  all.length - 1,
                  Math.round(((position - left) / (right - left)) * (all.length - 1)),
                ),
              ),
            );
          }}
        >
          <title>Lượng bán của {name}</title>
          <desc>Đường liền: đã bán. Đường đứt: dự kiến. Số liệu chi tiết ở bảng bên dưới.</desc>
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1={left}
                x2={right}
                y1={y(max * ratio)}
                y2={y(max * ratio)}
                stroke="var(--ds-border)"
              />
              <text x={left - 8} y={y(max * ratio) + 4} textAnchor="end">
                {new Intl.NumberFormat('vi-VN', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(max * ratio)}
              </text>
            </g>
          ))}
          <polyline
            points={path(historical)}
            fill="none"
            stroke="var(--ds-primary)"
            strokeWidth="2.5"
          />
          <polyline
            points={path(series.daily, historical.length)}
            fill="none"
            stroke="var(--ds-warning)"
            strokeWidth="2.5"
            strokeDasharray="5 4"
          />
          {active && (
            <g>
              <line
                x1={x(activeIndex)}
                x2={x(activeIndex)}
                y1="25"
                y2="190"
                stroke="var(--ds-control-border)"
                strokeDasharray="3 4"
              />
              <circle
                cx={x(activeIndex)}
                cy={y(active.quantity)}
                r="4"
                fill={activeIndex < historical.length ? 'var(--ds-primary)' : 'var(--ds-warning)'}
              />
            </g>
          )}
          <text x={left} y="216">
            {all[0]?.date.slice(5)}
          </text>
          <text x={right} y="216" textAnchor="end">
            {all.at(-1)?.date.slice(5)}
          </text>
        </svg>
      </div>
      {all.length > 1 && (
        <>
          <label className="sr-only" htmlFor={sliderId}>
            Xem lượng bán theo ngày
          </label>
          <input
            className="demand-chart-slider"
            id={sliderId}
            type="range"
            min={0}
            max={all.length - 1}
            value={activeIndex}
            aria-valuetext={
              active
                ? `${active.date} · ${activeKind}: ${formatQuantity(active.quantity)}`
                : undefined
            }
            onChange={(event) => setSelected(Number(event.target.value))}
          />
        </>
      )}
      <details className="demand-chart-data">
        <summary>Xem số liệu từng ngày</summary>
        <div
          className="admin-table-scroll"
          role="region"
          aria-label="Lượng bán và dự báo theo ngày"
          tabIndex={0}
        >
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Loại số liệu</th>
                <th scope="col" className="numeric-cell">
                  Số lượng
                </th>
              </tr>
            </thead>
            <tbody>
              {all.map((point, index) => (
                <tr key={`${point.date}-${index}`}>
                  <th scope="row">{point.date}</th>
                  <td>{index < historical.length ? 'Đã bán' : 'Dự kiến'}</td>
                  <td className="numeric-cell">{formatQuantity(point.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
