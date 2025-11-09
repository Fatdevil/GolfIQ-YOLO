import type { MouseEventHandler } from "react";

import { cn } from "@web/lib/cn";

type ClipBadgeProps = {
  count: number;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
};

export default function ClipBadge({ count, onClick, className }: ClipBadgeProps): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200",
        onClick ? "hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" : "cursor-default",
        className,
      )}
      onClick={onClick}
      aria-label={count > 0 ? `${count} clips available` : "No clips yet"}
    >
      <span aria-hidden>🎬</span>
      <span>{count}</span>
    </button>
  );
}
