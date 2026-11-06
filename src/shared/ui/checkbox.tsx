import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "aria-label"> {
  label: string;
}

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className={cn("size-3.5 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed", className)}
      {...rest}
    />
  );
}
