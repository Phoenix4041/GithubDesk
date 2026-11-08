import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { SearchInput } from "@/shared/ui/search-input";
import { Skeleton } from "@/shared/ui/skeleton";
import { filterItems, sameSet } from "../collab-model";

export interface PickerItem {
  id: string;
  label: string;
  detail?: string;
  avatarUrl?: string;
  color?: string;
}

interface PickerDialogProps {
  open: boolean;
  title: string;
  description?: string;
  items: PickerItem[];
  selected: string[];
  multiple: boolean;
  loading: boolean;
  errorMessage?: string;
  emptyText: string;
  noneLabel?: string;
  onSave: (ids: string[]) => Promise<boolean>;
  onClose: () => void;
}

function PickerForm({
  title,
  description,
  items,
  selected,
  multiple,
  loading,
  errorMessage,
  emptyText,
  noneLabel,
  onSave,
  onClose,
}: Omit<PickerDialogProps, "open">) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const current = chosen ?? selected;
  const visible = filterItems(items, query);
  const changed = !sameSet(selected, current);

  function toggle(id: string) {
    if (!multiple) {
      setChosen(id === "" ? [] : [id]);
      return;
    }
    setChosen(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function save() {
    setBusy(true);
    const saved = await onSave(current);
    setBusy(false);
    if (saved) {
      onClose();
    }
  }

  let body;
  if (loading) {
    body = <Skeleton className="h-32" />;
  } else if (errorMessage) {
    body = <p className="text-xs text-danger">{errorMessage}</p>;
  } else if (items.length === 0) {
    body = <p className="text-xs text-muted">{emptyText}</p>;
  } else {
    body = (
      <ul className="flex max-h-64 flex-col overflow-y-auto rounded-md border border-line" role={multiple ? "list" : "radiogroup"}>
        {!multiple && noneLabel ? (
          <li>
            <button
              type="button"
              role="radio"
              aria-checked={current.length === 0}
              onClick={() => toggle("")}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-subtle",
                current.length === 0 && "bg-accent-soft",
              )}
            >
              {noneLabel}
            </button>
          </li>
        ) : null}
        {visible.map((item) => {
          const active = current.includes(item.id);
          const content = (
            <>
              {item.avatarUrl !== undefined ? <Avatar url={item.avatarUrl} name={item.label} size={18} /> : null}
              {item.color ? (
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: `#${item.color}` }} />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.detail ? <span className="max-w-[40%] truncate text-[11px] text-muted">{item.detail}</span> : null}
            </>
          );
          return (
            <li key={item.id}>
              {multiple ? (
                <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-subtle">
                  <Checkbox label={item.label} checked={active} onChange={() => toggle(item.id)} />
                  {content}
                </label>
              ) : (
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-subtle",
                    active && "bg-accent-soft",
                  )}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Dialog
      open
      title={title}
      description={description}
      onClose={onClose}
      dismissible={!busy}
      width="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!changed || loading} loading={busy} onClick={() => void save()}>
            {t("github.collab.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {items.length > 6 ? <SearchInput label={t("github.collab.filter")} value={query} onValueChange={setQuery} /> : null}
        {body}
      </div>
    </Dialog>
  );
}

export function PickerDialog({ open, ...rest }: PickerDialogProps) {
  if (!open) {
    return null;
  }
  return <PickerForm {...rest} />;
}
