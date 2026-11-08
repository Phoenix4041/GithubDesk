import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

export type ImageDiffMode = "side" | "swipe" | "onion";

export interface ImageVersion {
  url: string | null;
  size: number | null;
  note: string | null;
}

interface ImageDiffViewerProps {
  before: ImageVersion;
  after: ImageVersion;
}

const CHECKERBOARD: CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

interface Dimensions {
  width: number;
  height: number;
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function Caption({ title, version, dimensions }: { title: string; version: ImageVersion; dimensions: Dimensions | null }) {
  const details = [
    dimensions ? `${dimensions.width} × ${dimensions.height}` : null,
    version.size !== null ? formatBytes(version.size) : null,
  ].filter((part): part is string => part !== null);
  return (
    <p className="flex items-baseline gap-2 text-[11px]">
      <span className="font-semibold">{title}</span>
      {details.length > 0 ? <span className="text-muted tabular-nums">{details.join(" · ")}</span> : null}
    </p>
  );
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid max-w-full place-items-center overflow-hidden rounded-md border border-line", className)} style={CHECKERBOARD}>
      {children}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <p className="grid min-h-24 min-w-40 place-items-center px-4 py-6 text-xs text-muted">{text}</p>;
}

export function ImageDiffViewer({ before, after }: ImageDiffViewerProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ImageDiffMode>("side");
  const [position, setPosition] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [beforeSize, setBeforeSize] = useState<Dimensions | null>(null);
  const [afterSize, setAfterSize] = useState<Dimensions | null>(null);
  const overlayAvailable = before.url !== null && after.url !== null;
  const activeMode: ImageDiffMode = overlayAvailable ? mode : "side";

  const modes: Array<{ id: ImageDiffMode; label: string }> = [
    { id: "side", label: t("imageDiff.modes.side") },
    { id: "swipe", label: t("imageDiff.modes.swipe") },
    { id: "onion", label: t("imageDiff.modes.onion") },
  ];

  function image(version: ImageVersion, alt: string, onSize: (size: Dimensions) => void, style?: CSSProperties) {
    if (!version.url) {
      return <Placeholder text={version.note ?? t("imageDiff.missing")} />;
    }
    return (
      <img
        src={version.url}
        alt={alt}
        draggable={false}
        style={style}
        className="max-h-[60vh] max-w-full object-contain [grid-area:1/1]"
        onLoad={(event) => onSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      />
    );
  }

  const beforeAlt = t("imageDiff.before");
  const afterAlt = t("imageDiff.after");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div role="tablist" aria-label={t("imageDiff.modesLabel")} className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-1.5">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeMode === item.id}
            disabled={item.id !== "side" && !overlayAvailable}
            onClick={() => setMode(item.id)}
            className={cn(
              "h-7 cursor-pointer rounded-md px-2 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
              activeMode === item.id ? "bg-subtle text-fg" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 p-4">
        {activeMode === "side" ? (
          <div className="grid grid-cols-2 gap-4">
            <figure className="flex min-w-0 flex-col gap-1.5">
              <Caption title={beforeAlt} version={before} dimensions={beforeSize} />
              <Frame className="border-del/60">{image(before, beforeAlt, setBeforeSize)}</Frame>
            </figure>
            <figure className="flex min-w-0 flex-col gap-1.5">
              <Caption title={afterAlt} version={after} dimensions={afterSize} />
              <Frame className="border-add/60">{image(after, afterAlt, setAfterSize)}</Frame>
            </figure>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex w-full justify-between gap-4">
              <Caption title={beforeAlt} version={before} dimensions={beforeSize} />
              <Caption title={afterAlt} version={after} dimensions={afterSize} />
            </div>
            <Frame>
              {image(before, beforeAlt, setBeforeSize)}
              {image(
                after,
                afterAlt,
                setAfterSize,
                activeMode === "swipe" ? { clipPath: `inset(0 0 0 ${position}%)` } : { opacity: opacity / 100 },
              )}
            </Frame>
            {activeMode === "swipe" ? (
              <input
                type="range"
                min={0}
                max={100}
                value={position}
                aria-label={t("imageDiff.swipeLabel")}
                onChange={(event) => setPosition(Number(event.target.value))}
                className="w-full max-w-md cursor-pointer accent-accent"
              />
            ) : (
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                aria-label={t("imageDiff.opacityLabel")}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="w-full max-w-md cursor-pointer accent-accent"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
