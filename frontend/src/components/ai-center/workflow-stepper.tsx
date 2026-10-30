'use client';
import { Database, ScanSearch, Layers, Split, BrainCircuit, ChartNoAxesCombined, Rocket, Check, CircleAlert } from 'lucide-react';
import type { Dataset, Job, Models } from './types';

const steps = [
  {key:'DATA_COLLECTION',label:'Thu thập',Icon:Database},
  {key:'EDA',label:'Khám phá dữ liệu',Icon:ScanSearch},
  {key:'FEATURES',label:'Đặc trưng',Icon:Layers},
  {key:'SPLITTING',label:'Chia dữ liệu',Icon:Split},
  {key:'TRAINING',label:'Huấn luyện',Icon:BrainCircuit},
  {key:'EVALUATION',label:'Đánh giá',Icon:ChartNoAxesCombined},
  {key:'DEPLOYMENT',label:'Triển khai',Icon:Rocket},
];
export function WorkflowStepper({dataset,job,models,insufficient}:{dataset:Dataset|null;job:Job|null;models:Models|null;insufficient:boolean}) {
  const events = job?.progress?.events ?? [];
  const latest = steps.findIndex(s=>s.key === job?.progress?.stage);
  const lastRecorded = Math.max(-1,...events.map(e=>steps.findIndex(s=>s.key===e.stage)));
  const active = Math.max(latest,lastRecorded);
  return <ol className="ai-stepper" aria-label="Quy trình huấn luyện">{steps.map(({key,label,Icon},index)=>{
    let state='waiting', text='Chưa bắt đầu';
    if (key === 'DEPLOYMENT') {
      if (job && (models?.active.model_version === job.modelVersion || models?.deployments.some(d=>d.modelVersion===job.modelVersion && d.status==='COMPLETED'))) {state='done';text='Đã triển khai';}
      else if (job?.result) text=job.result.metadata.contains_synthetic || !job.result.metadata.activation_eligible ? 'Chưa đủ điều kiện' : 'Chờ kích hoạt';
    } else if (job) {
      // A later recorded stage or a persisted completed result proves an earlier stage finished.
      if ((job.status === 'COMPLETED' && job.result) || index < active) {state='done';text='Hoàn tất';}
      else if (index === active) {
        state=job.status === 'FAILED' ? 'failed' : job.status === 'RUNNING' ? 'running' : 'waiting';
        text=job.status === 'FAILED' ? 'Thất bại' : job.status === 'CANCELLED' ? 'Đã dừng' : job.status === 'RUNNING' ? 'Đang chạy' : 'Chưa có xác nhận';
      }
    } else if (index===0 && dataset?.status==='PUBLISHED') {state='done';text='Đã chốt dữ liệu';}
    else if (index===0 && dataset?.summary && !dataset.summary.valid) {state='failed';text='Cần sửa dữ liệu';}
    if (!job && index===1 && insufficient) {state='warning';text='Thiếu lịch sử';}
    return <li key={key} className={`ai-step ${state}`} aria-current={state==='running'?'step':undefined}><span className="ai-step-icon">{state==='done'?<Check size={17}/>:state==='failed'?<CircleAlert size={17}/>:<Icon size={17}/>}</span><strong>{label}</strong><small>{text}</small></li>;
  })}</ol>;
}
