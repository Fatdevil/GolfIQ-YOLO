import type { DrawCmd, ReelTimeline } from '@shared/reels/types';

export function drawCommands(
  ctx: CanvasRenderingContext2D,
  timeline: ReelTimeline,
  commands: DrawCmd[],
): void {
  ctx.save();
  ctx.clearRect(0, 0, timeline.width, timeline.height);
  for (const cmd of commands) {
    switch (cmd.t) {
      case 'bg': {
        ctx.fillStyle = cmd.color;
        ctx.fillRect(0, 0, timeline.width, timeline.height);
        break;
      }
      case 'bar': {
        ctx.fillStyle = cmd.color;
        ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
        break;
      }
      case 'tracer': {
        if (!cmd.pts.length) {
          break;
        }
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = cmd.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(cmd.dash ?? []);
        ctx.beginPath();
        ctx.moveTo(cmd.pts[0][0], cmd.pts[0][1]);
        for (let i = 1; i < cmd.pts.length; i += 1) {
          ctx.lineTo(cmd.pts[i][0], cmd.pts[i][1]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'dot': {
        ctx.fillStyle = cmd.color;
        ctx.beginPath();
        ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'text': {
        ctx.fillStyle = cmd.color;
        ctx.font = `${cmd.bold ? '600' : '400'} ${cmd.size}px "Inter", "Helvetica Neue", sans-serif`;
        ctx.textAlign = cmd.align ?? 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cmd.text, cmd.x, cmd.y);
        break;
      }
      case 'compass': {
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, cmd.radius, 0, Math.PI * 2);
        ctx.stroke();
        const rad = ((cmd.deg ?? 0) - 90) * (Math.PI / 180);
        const pointerX = cmd.cx + Math.cos(rad) * cmd.radius;
        const pointerY = cmd.cy + Math.sin(rad) * cmd.radius;
        ctx.beginPath();
        ctx.moveTo(cmd.cx, cmd.cy);
        ctx.lineTo(pointerX, pointerY);
        ctx.stroke();
        break;
      }
      default:
        break;
    }
  }
  ctx.restore();
}
