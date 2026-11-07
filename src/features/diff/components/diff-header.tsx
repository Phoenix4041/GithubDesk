import type { ReactNode } from "react";
import { splitPath } from "@/shared/lib/paths";
import { DiffOptions } from "./diff-options";

interface DiffHeaderProps {
  path: string;
  badge?: ReactNode;
}

export function DiffHeader({ path, badge }: DiffHeaderProps) {
  const { directory, fileName } = splitPath(path);
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
      {badge}
      <h2 className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
        <span className="shrink-0 font-semibold">{fileName}</span>
        <span className="truncate text-xs text-muted" title={path}>
          {directory}
        </span>
      </h2>
      <DiffOptions />
    </header>
  );
}
