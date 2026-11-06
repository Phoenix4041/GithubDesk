import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-fg hover:bg-subtle",
  ghost: "text-fg hover:bg-subtle",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-[13px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium whitespace-nowrap",
        "transition-[background-color,transform,opacity] duration-150 ease-out-expo",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
