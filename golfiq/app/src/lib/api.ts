const API_FROM_ENV = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:8000';
export const API_BASE = API_FROM_ENV as string;

export type ViewKind = 'DTL'|'FO';
export type Meta = { fps:number; scale_m_per_px:number; calibrated:boolean; view:ViewKind };
export type Box = { cls:string; conf:number; x1:number; y1:number; x2:number; y2:number; };
export type DetFrame = { t?:number; dets: Box[] };
export type ImgFrame = { t?:number; image_b64: string };
export type YoloConfig = { model_path:string; class_map?:Record<number,string>; conf?:number };
export type CoachMode = 'short'|'detailed'|'drill';

export async function calibrate(a4_width_px:number){
  const url = `${API_BASE}/calibrate?a4_width_px=${a4_width_px}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('Calibrate failed');
  return await r.json();
}

export async function inferWithDetections(meta: Meta, detections: DetFrame[]){
  const payload = { mode: 'detections', detections, meta };
  const r = await fetch(`${API_BASE}/infer`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error('Infer failed');
  return await r.json();
}

export async function inferWithFrames(meta: Meta, frames: ImgFrame[], yolo: YoloConfig){
  const payload = { mode: 'frames_b64', frames, meta, yolo };
  const r = await fetch(`${API_BASE}/infer`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(`Infer failed (${r.status})`);
  return await r.json();
}

export async function coachFeedback(mode: CoachMode, metrics: any, notes: string=''){
  const r = await fetch(`${API_BASE}/coach`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ mode, metrics, notes })
  });
  if(!r.ok) throw new Error('Coach failed');
  return await r.json(); // {text}
}

export async function metricsFaceOn(baseUrl: string, payload: {
  frame_w: number; frame_h: number; detections: any[]; mm_per_px?: number|null;
}) {
  const r = await fetch(baseUrl + "/metrics/faceon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("metricsFaceOn " + r.status);
  return await r.json();
}
