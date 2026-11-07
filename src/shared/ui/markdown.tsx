import { lazy, Suspense } from "react";
import { cn } from "@/shared/lib/cn";

const MarkdownRenderer = lazy(() => import("./markdown-renderer"));

interface MarkdownProps {
  source: string;
  className?: string;
}

export function Markdown({ source, className }: MarkdownProps) {
  return (
    <div className={cn("markdown selectable text-[13px] leading-6", className)}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{source}</p>}>
        <MarkdownRenderer source={source} />
      </Suspense>
    </div>
  );
}
