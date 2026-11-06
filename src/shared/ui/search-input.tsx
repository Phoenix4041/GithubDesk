import { Search, X } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "aria-label"> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}

export function SearchInput({ label, value, onValueChange, className, ...rest }: SearchInputProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="h-8 w-full rounded-md border border-line bg-surface pr-7 pl-8 text-[13px] text-fg placeholder:text-muted transition-colors duration-150 hover:border-muted/60 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        {...rest}
      />
      {value ? (
        <button
          type="button"
          aria-label={t("common.clearSearch")}
          title={t("common.clearSearch")}
          onClick={() => onValueChange("")}
          className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-muted transition-colors duration-150 hover:bg-subtle hover:text-fg"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
