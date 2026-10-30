'use client';
import { useState, type ReactNode } from 'react';
import type { TrainingResult } from './types';
import { Badge, ChartInteraction, DataTable, LineChart, numberText } from './shared';

type Metric = { mae: number; rmse: number; wape: number | null; bias: number | null };
const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');
const featureName = (name: string) => name === 'quantity' ? 'Lượng bán' : name === 'day_of_week' ? 'Thứ trong tuần' : name === 'month' ? 'Tháng' : name.replace('rolling_mean_', 'TB ').replace('lag_', 'Trễ ') + ' ngày';
const format = (value: number | null | undefined, percent = false) => value == null ? '—' : (percent ? value * 100 : value).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + (percent ? '%' : '');
function Chart({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <figure className="ai-chart ai-analysis-chart"><figcaption>{title}</figcaption><p className="field-hint">{note}</p><ChartInteraction>{children}</ChartInteraction></figure>;
}
function Heatmap({ title, rows, columns, values, diverging = false }: { title: string; rows: string[]; columns: string[]; values: (number | null)[][]; diverging?: boolean }) {
  const cellWidth = Math.min(38, 420 / Math.max(1, columns.length)), width = 145 + columns.length * cellWidth, height = 75 + rows.length * 25;
  return <div className="ai-heatmap-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 420 }} role="img" aria-label={title}>
    {rows.map((row,y) => <g key={row}><text x="128" y={42 + y * 25} textAnchor="end">{row}</text>{columns.map((column,x) => {
      const value = values[y]?.[x] ?? null, intensity = Math.min(1, Math.abs(value ?? 0) / (diverging ? 1 : 100));
      const color = value === null ? '#e5e7eb' : `hsl(${diverging && value < 0 ? 15 : 157} ${32 + intensity * 24}% ${96 - intensity * 61}%)`;
      return <rect data-point tabIndex={0} key={column + x} x={138 + x * cellWidth} y={26 + y * 25} width={cellWidth - 2} height="23" rx="3" fill={color} aria-label={`${row}, ${column}: ${value === null ? 'Không xác định' : format(value) + (diverging ? '' : '%')}`}><title>{row} · {column}: {value === null ? 'Không xác định (hằng số hoặc chưa đủ mẫu)' : format(value) + (diverging ? '' : '%')}</title></rect>;
    })}</g>)}
    {columns.map((column,i) => (columns.length <= 10 || i === 0 || i === columns.length - 1) && <text key={column+i} x={138 + (i + .5) * cellWidth} y={rows.length * 25 + 45} textAnchor="middle">{diverging ? i + 1 : shortDate(column)}</text>)}
  </svg><div className="ai-chart-legend">{diverging ? 'Cam: nghịch chiều · Trắng: gần 0 · Xanh: cùng chiều · Xám: không xác định. Các cột đánh số theo thứ tự hàng.' : 'Trắng: đủ dữ liệu (0% thiếu) · Xanh đậm: thiếu nhiều (đến 100%). Di chuột hoặc Tab vào ô để xem.'}</div><div className={`ai-scale ${diverging ? 'diverging' : ''}`}><span>{diverging ? '−1' : '0% thiếu'}</span><i /><span>{diverging ? '+1' : '100% thiếu'}</span></div><details><summary>Xem số liệu gốc</summary><DataTable rows={rows.map((label,y)=>Object.fromEntries([['Đặc trưng',label],...columns.map((column,x)=>[column,values[y]?.[x]])]))} /></details></div>;
}
function Calendar({ daily, unit }: { daily: { date: string; quantity: number }[]; unit: string }) {
  const points = daily.slice(-182), start = points[0]?.date;
  if (!start) return <p>Chưa có dữ liệu theo ngày.</p>;
  const offset = (new Date(start).getUTCDay() + 6) % 7, max = Math.max(1, ...points.map(p => p.quantity));
  const weeks = Math.ceil((points.length + offset) / 7), width = Math.max(460, weeks * 19 + 55);
  return <Chart title="Lịch bán hàng" note={`Toàn bộ dataset ${unit} (không lọc theo chuỗi/mô hình/test) · ${points[0].date} → ${points.at(-1)!.date}. Màu đậm: bán nhiều; ô nhạt: lượng bằng 0.`}>
    <div className="ai-heatmap-scroll"><svg viewBox={`0 0 ${width} 192`} style={{ minWidth: 420 }} role="img" aria-label={`Lịch bán hàng ${unit}`}>
      {['T2','T3','T4','T5','T6','T7','CN'].map((d,i) => <text key={d} x="3" y={41+i*19}>{d}</text>)}
      {points.map((p,i) => { const week = Math.floor((i+offset)/7), day = (i+offset)%7; return <g key={p.date}>{(i === 0 || p.date.endsWith('-01')) && <text x={35+week*19} y="14">{p.date.slice(5,7)}/{p.date.slice(0,4)}</text>}<rect data-point tabIndex={0} aria-label={`${p.date}: ${numberText(p.quantity)} ${unit}`} x={35+week*19} y={28+day*19} width="16" height="16" rx="3" fill={`hsl(157 40% ${96-60*p.quantity/max}%)`}><title>{p.date}: {numberText(p.quantity)} {unit}</title></rect></g>; })}
      <text x="35" y="181">{shortDate(start)}</text><text x={35+(weeks-1)*19} y="181" textAnchor="end">{shortDate(points.at(-1)!.date)}</text>
    </svg><div className="ai-scale"><span>0 {unit}</span><i /><span>{format(max)} {unit}</span></div></div><details><summary>Số liệu lịch bán hàng</summary><DataTable rows={points.map(p => ({ Ngày:p.date, [`Lượng bán (${unit})`]:p.quantity }))} /></details>
  </Chart>;
}
function Density({ points, unit }: { points: { actual: number; predicted: number }[]; unit: string }) {
  if (!points.length) return <p className="field-hint">Chưa có mẫu dự báo để xem mật độ.</p>;
  const max = Math.max(1,...points.flatMap(p => [p.actual,p.predicted])), bins = Array.from({length:10},()=>Array<number>(10).fill(0));
  points.forEach(p => bins[Math.min(9,Math.floor(p.predicted/max*10))][Math.min(9,Math.floor(p.actual/max*10))]++);
  const peak = Math.max(1,...bins.flat());
  return <Chart title="Mật độ thực tế / dự báo" note={`Histogram hai chiều · ${points.length} điểm test mẫu · ${unit}. Ô đậm chứa nhiều điểm; gần đường chéo là dự báo sát thực tế.`}>
    <svg viewBox="0 0 430 285" role="img" aria-label="Mật độ thực tế và dự báo"><text x="15" y="15">Dự báo ({unit})</text>{bins.map((row,y)=>row.map((count,x)=><rect data-point key={`${x}-${y}`} tabIndex={0} x={55+x*30} y={25+(9-y)*22} width="29" height="21" fill={count ? `hsl(157 42% ${92-55*count/peak}%)` : '#f2f5f3'}><title>{count} điểm · thực tế {format(x*max/10)}–{format((x+1)*max/10)}; dự báo {format(y*max/10)}–{format((y+1)*max/10)}</title></rect>))}<line x1="55" y1="245" x2="355" y2="25" stroke="#b36a32" strokeDasharray="4 4" /><text x="36" y="245">0</text><text x="36" y="33" textAnchor="end">{format(max)}</text><text x="355" y="263" textAnchor="end">{format(max)}</text><text x="180" y="282">Thực tế ({unit})</text></svg><div className="ai-scale"><span>0 điểm</span><i /><span>{peak} điểm/ô</span></div><details><summary>Xem các điểm mẫu</summary><DataTable rows={points.map(p=>({'Thực tế':p.actual,'Dự báo':p.predicted,'Đơn vị':unit}))} /></details>
  </Chart>;
}
export function ResultDashboard({ result }: { result: TrainingResult }) {
  const [advanced,setAdvanced] = useState('calendar'), [unitChoice,setUnit] = useState(''), [horizonChoice,setHorizon] = useState('7'), [algorithm,setAlgorithm] = useState(result.metadata.algorithm), [pair,setPair] = useState('');
  const {evaluation,eda} = result, units = Object.keys(eda.by_unit), unit = units.includes(unitChoice) ? unitChoice : units[0];
  const horizon = evaluation.protocol.horizons.map(String).includes(horizonChoice) ? horizonChoice : String(evaluation.protocol.horizons[0]);
  const metrics = Object.entries(evaluation.test).map(([model,windows]) => ({ model, metric: (windows[horizon]?.by_unit as Record<string,{daily:Metric}> | undefined)?.[unit]?.daily }));
  const ranked = [...metrics].sort((a,b)=>(a.metric?.wape ?? Infinity)-(b.metric?.wape ?? Infinity));
  const chosen = metrics.find(m=>m.model===algorithm)?.metric;
  const all = evaluation.diagnostics?.[algorithm]?.samples ?? [], samples = all.filter(p=>p.unit===unit && p.date<=new Date(Date.parse(evaluation.protocol.test_origin)+Number(horizon)*86400000).toISOString().slice(0,10));
  const pairs = [...new Set(samples.map(p=>JSON.stringify([p.store_id,p.product_id])))], selected = pairs.includes(pair) ? pair : pairs[0];
  const points = samples.filter(p=>JSON.stringify([p.store_id,p.product_id])===selected);
  const features = eda.feature_diagnostics?.by_unit[unit], byUnit = eda.by_unit[unit];
  const maxWape = Math.max(.01,...metrics.map(m=>m.metric?.wape ?? 0));
  return <div className="ai-dashboard">
    <div className="ai-result-heading"><div><span className="ai-eyebrow">MÔ HÌNH ĐƯỢC CHỌN</span><h3>{result.metadata.algorithm}</h3><p className="field-hint ai-version">{result.metadata.model_version}</p></div><div className="ai-row"><Badge status="COMPLETED" />{result.metadata.contains_synthetic && <span className="ai-demo-badge" tabIndex={0} title="Dữ liệu mô phỏng: kết quả chỉ kiểm tra kỹ thuật, chưa chứng minh độ chính xác thực tế và không đủ điều kiện triển khai.">Dữ liệu demo · chỉ thử nghiệm</span>}</div></div>
    <div className="ai-result-filters" role="group" aria-label="Bộ lọc kết quả"><label>Đơn vị<select aria-label="Đơn vị biểu đồ" value={unit ?? ''} onChange={e=>setUnit(e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label><label>Cửa sổ test<select aria-label="Cửa sổ biểu đồ" value={horizon} onChange={e=>setHorizon(e.target.value)}>{evaluation.protocol.horizons.map(h=><option key={h} value={h}>{h} ngày</option>)}</select></label><label>Mô hình xem<select aria-label="Mô hình biểu đồ" value={algorithm} onChange={e=>setAlgorithm(e.target.value)}>{metrics.map(m=><option key={m.model}>{m.model}</option>)}</select></label><label>Chuỗi trên biểu đồ mẫu<select aria-label="Chuỗi biểu đồ" value={selected ?? ''} onChange={e=>setPair(e.target.value)}>{!pairs.length && <option value="">Chưa có mẫu</option>}{pairs.map(p=><option key={p} value={p}>{(JSON.parse(p) as string[]).join(' / ')}</option>)}</select></label></div>
    <p className="ai-metric-scope">Chỉ số: <strong>{algorithm}</strong> · toàn bộ chuỗi {unit} · test {horizon} ngày. Lựa chọn mô hình được chốt trên validation.</p>
    <div className="ai-metric-cards">{[['WAPE',format(chosen?.wape,true),'Sai số tương đối. Thấp hơn tốt hơn. Không xác định khi tổng lượng bán bằng 0.'],['MAE',format(chosen?.mae),`Sai lệch trung bình, đơn vị ${unit}.`],['RMSE',format(chosen?.rmse),`Nhạy với sai lệch lớn, đơn vị ${unit}.`],['Chuỗi trong dataset',numberText(eda.pairs),'Tổng số chuỗi của toàn bộ dataset, không phải số chuỗi trong bộ lọc.']].map(([label,value,note])=><div key={label} tabIndex={0} title={note}><span>{label}</span><strong>{value}</strong>{['MAE','RMSE'].includes(label) && <small>{unit}</small>}</div>)}</div>
    <div className="ai-chart-grid"><div className="ai-chart-cell"><LineChart title={`Thực tế và dự báo · ${unit}`} labels={points.map(p=>p.date)} series={[{name:'Thực tế',values:points.map(p=>p.actual),color:'#17604f'},{name:'Dự báo',values:points.map(p=>p.predicted),color:'#c4742a'}]} /><p className="field-hint">Chuỗi đang chọn · mẫu test {horizon} ngày. KPI phía trên dùng toàn bộ chuỗi {unit}.</p></div>
      <Chart title="So sánh mô hình" note={`WAPE · test ${horizon} ngày · toàn bộ chuỗi ${unit}. Thấp hơn tốt hơn.`}><div className="ai-bar-list">{ranked.map(m=><div key={m.model} className={m.metric?.wape != null && m.metric.wape === ranked[0]?.metric?.wape ? 'ai-best-model' : ''}><div><span>{m.model}{m.metric?.wape != null && m.metric.wape === ranked[0]?.metric?.wape && <small>Thấp nhất kỳ test</small>}</span><strong>{format(m.metric?.wape,true)}</strong></div><div className="ai-bar-track" tabIndex={0} title={`${m.model}: ${format(m.metric?.wape,true)} — thấp hơn tốt hơn`}><span style={{width:`${100*(m.metric?.wape ?? 0)/maxWape}%`}} /></div></div>)}</div><p className="field-hint">Cùng cửa sổ và đơn vị. “—” là chưa xác định, không phải sai số bằng 0.</p></Chart>
    </div>
    <details className="ai-advanced ai-analytics"><summary>Phân tích chuyên sâu<span>Lịch bán hàng, mật độ, đặc trưng</span></summary><label className="ai-inline-filter">Biểu đồ<select aria-label="Phân tích chuyên sâu" value={advanced} onChange={e=>setAdvanced(e.target.value)}><option value="calendar">Lịch bán hàng</option><option value="density">Mật độ thực tế / dự báo</option><option value="errors">Phân phối sai số mẫu</option><option value="correlation">Tương quan đặc trưng</option><option value="missing">Mức thiếu dữ liệu</option>{evaluation.feature_importance && <option value="importance">Đóng góp đặc trưng LightGBM</option>}</select></label>
      {advanced === 'calendar' && (byUnit ? <Calendar daily={byUnit.daily} unit={unit} /> : <p>Chưa có dữ liệu theo ngày.</p>)}
      {advanced === 'density' && <Density points={points} unit={unit} />}
      {advanced === 'errors' && <Chart title="Phân phối sai số mẫu" note={`${algorithm} · ${horizon} ngày · chuỗi đang chọn · sai số = dự báo − thực tế (${unit}).`}><ErrorDistribution points={points} unit={unit} /></Chart>}
      {['correlation','missing'].includes(advanced) && (features ? advanced === 'correlation' ? <Chart title="Tương quan đặc trưng" note={`Pearson · toàn bộ ${features.eligible_rows} dòng train đủ lịch sử ${unit} · đến ${eda.feature_diagnostics!.train_end}. Không phụ thuộc mô hình/cửa sổ test; không chứng minh quan hệ nhân quả.`}><Heatmap title="Tương quan đặc trưng" rows={features.labels.map(featureName)} columns={features.labels.map(featureName)} values={features.correlation} diverging /></Chart> : <Chart title="Mức thiếu dữ liệu theo thời gian" note={`Toàn bộ tập train ${unit}. Lag/rolling thiếu ở đầu chuỗi do chưa đủ lịch sử, không phải lỗi CSV. Không tự điền 0; không áp dụng bộ lọc mô hình/cửa sổ test.`}><Heatmap title="Mức thiếu dữ liệu theo thời gian" rows={features.labels.map(featureName)} columns={features.missing.map(b=>b.from)} values={features.labels.map((_,i)=>features.missing.map(b=>b.percent[i]))} /></Chart> : <p className="ai-notice">Lần chạy này chưa lưu dữ liệu đặc trưng cho biểu đồ. Các kết quả đã có vẫn được giữ nguyên.</p>)}
      {advanced === 'importance' && evaluation.feature_importance && <Chart title="Đóng góp đặc trưng LightGBM" note="Số lần dùng để chia nhánh của LightGBM trong lần chạy này. Toàn bộ tập train; không áp dụng bộ lọc chuỗi/test."><DataTable rows={Object.entries(evaluation.feature_importance).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({'Đặc trưng':featureName(name),'Số lần chia':value}))} /></Chart>}
    </details>
    <details className="ai-advanced"><summary>Số liệu & phương pháp đánh giá</summary><DataTable rows={metrics.map(m=>({Model:m.model,'Đơn vị':unit,MAE:m.metric?.mae,RMSE:m.metric?.rmse,'WAPE (%)':m.metric?.wape==null?null:m.metric.wape*100,'Bias (%)':m.metric?.bias==null?null:m.metric.bias*100}))} /><div className="ai-split"><div>Train đến {evaluation.protocol.validation_origin}</div><div>Validation đến {evaluation.protocol.test_origin}</div><div>Test đến {evaluation.protocol.test_end}</div></div><p className="field-hint">Không chia ngẫu nhiên; không dùng test để chọn mô hình. Biểu đồ dùng tối đa 3.000 điểm mẫu/model; KPI dùng kết quả đánh giá đầy đủ.</p><DataTable rows={[{'Dòng toàn dataset':eda.rows,'Giá trị thiếu nguồn':eda.missing_values,'Dòng trùng':eda.duplicates,'Ngày bán bằng 0':eda.zero_days}]} />{result.metadata.contains_synthetic && <p className="ai-notice">Synthetic/demo backtest — not evidence of real-world forecasting accuracy.</p>}</details>
  </div>;
}
function ErrorDistribution({points,unit}:{points:{actual:number;predicted:number}[];unit:string}) {
  if (!points.length) return <p>Chưa có điểm mẫu phù hợp.</p>;
  const values=points.map(p=>p.predicted-p.actual), min=Math.min(...values), max=Math.max(...values), width=(max-min || 1)/10;
  const counts=Array<number>(10).fill(0); values.forEach(value=>counts[Math.min(9,Math.floor((value-min)/width))]++);
  const peak=Math.max(1,...counts);
  return <><svg viewBox="0 0 640 220" role="img" aria-label="Phân phối sai số mẫu"><text x="12" y="16">Số điểm</text><text x="12" y="40">{peak}</text>{counts.map((count,i)=><rect data-point tabIndex={0} key={i} x={55+i*55} y={180-count/peak*140} width="48" height={count/peak*140} fill="#6585b4"><title>{format(min+i*width)} → {format(min+(i+1)*width)} {unit}: {count} điểm</title></rect>)}<line x1="50" x2="610" y1="180" y2="180" stroke="#cbd5d1" /><text x="50" y="202">{format(min)}</text><text x="610" y="202" textAnchor="end">{format(min+10*width)} {unit}</text></svg><details><summary>Xem số liệu gốc</summary><DataTable rows={counts.map((count,i)=>({'Từ':min+i*width,'Đến':min+(i+1)*width,'Số điểm':count,'Đơn vị':unit}))} /></details></>;
}
