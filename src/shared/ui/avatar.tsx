import { useState } from "react";
import { cn } from "@/shared/lib/cn";

interface AvatarProps {
  url: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ url, name, size = 24, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.45)) }}
        className={cn("grid shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent", className)}
      >
        {initial}
      </span>
    );
  }
  const source = url.includes("?") ? `${url}&s=${size * 2}` : `${url}?s=${size * 2}`;
  return (
    <img
      src={source}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-subtle", className)}
    />
  );
}
