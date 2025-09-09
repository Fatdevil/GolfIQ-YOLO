const API_FROM_ENV = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:8000';
export const API_BASE = API_FROM_ENV as string;

export type ViewKind = 'DTL'|'FO';
export type Meta = { fps:number; scale_m_per_px:number; calibrated:boolean; view:ViewKind };
export type Box = { cls:string; conf:number; x1:number; y1:number; x2:number; y2:number; };
export type DetFrame = { t?:number; dets: Box[] };
export type ImgFrame = { t?:number; image_b64: string };
export type YoloConfig = { model_path:string; class_map?:Record<number,string>; conf?:number };

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


export function mockDetections(): DetFrame[]{
  const frames: DetFrame[] = [
    {t:-0.02, dets:[
      {cls:'club_head', conf:0.9, x1:390,y1:590,x2:410,y2:610},
      {cls:'ball', conf:0.9, x1:500,y1:600,x2:502,y2:602}
    ]},
    {t:-0.01, dets:[
      {cls:'club_head', conf:0.9, x1:440,y1:560,x2:460,y2:580},
      {cls:'ball', conf:0.9, x1:500,y1:600,x2:502,y2:602}
    ]},
    {t:0.00, dets:[
      {cls:'club_head', conf:0.9, x1:500,y1:600,x2:520,y2:620},
      {cls:'ball', conf:0.9, x1:500,y1:600,x2:502,y2:602}
    ]},
    {t:0.01, dets:[
      {cls:'club_head', conf:0.9, x1:530,y1:610,x2:550,y2:630},
      {cls:'ball', conf:0.9, x1:515,y1:590,x2:517,y2:592}
    ]},
    {t:0.02, dets:[
      {cls:'club_head', conf:0.9, x1:560,y1:620,x2:580,y2:640},
      {cls:'ball', conf:0.9, x1:530,y1:580,x2:532,y2:582}
    ]}
  ];
  return frames;
}
