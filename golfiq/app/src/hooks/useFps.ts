import { useRef, useState, useEffect } from "react";
/** Enkel FPS-mätare: kalla tick() varje gång du skickar en frame till /infer. */
export function useFps(windowSize=30){
  const times = useRef<number[]>([]);
  const [fps, setFps] = useState<number|undefined>(undefined);
  function tick(){
    const t = performance.now();
    times.current.push(t);
    if(times.current.length>windowSize) times.current.shift();
    if(times.current.length>=2){
      const dt = (times.current[times.current.length-1]-times.current[0])/1000;
      const frames = times.current.length-1;
      setFps(frames/dt);
    }
  }
  return { fps, tick };
}
