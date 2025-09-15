from typing import Iterable, List, Tuple
Point = Tuple[float, float]
def moving_average(track: Iterable[Point], window: int = 3) -> List[Point]:
    pts=list(track); 
    if window<=1 or len(pts)<=2: return pts
    w=max(1,int(window)); out=[]
    for i in range(len(pts)):
        a=max(0,i-(w//2)); b=min(len(pts), i+(w//2)+1)
        xs=[p[0] for p in pts[a:b]]; ys=[p[1] for p in pts[a:b]]
        out.append((sum(xs)/len(xs), sum(ys)/len(ys)))
    return out
