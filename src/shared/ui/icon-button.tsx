import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> {
  label: string;
  children: ReactNode;
  active?: boolean;
}

export function IconButton({ label, children, className, active = false, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted",
        "transition-[background-color,color,transform] duration-150 ease-out-expo",
        "hover:bg-subtle hover:text-fg active:scale-95",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100",
        active && "bg-subtle text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
