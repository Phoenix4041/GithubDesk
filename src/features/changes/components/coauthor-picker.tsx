import { Users } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import type { Coauthor } from "../commit-message-model";
import { useCoauthors } from "../queries";

interface CoauthorPickerProps {
  repoPath: string;
  selected: readonly Coauthor[];
  onChange: (people: Coauthor[]) => void;
}

function sameEmail(left: Coauthor, right: Coauthor): boolean {
  return left.email.toLowerCase() === right.email.toLowerCase();
}

export function CoauthorPicker({ repoPath, selected, onChange }: CoauthorPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const listId = useId();
  const people = useCoauthors(repoPath, open);

  const needle = filter.trim().toLowerCase();
  const visible = (people.data ?? []).filter(
    (person) =>
      needle.length === 0 || person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle),
  );

  function toggle(person: Coauthor) {
    if (selected.some((existing) => sameEmail(existing, person))) {
      onChange(selected.filter((existing) => !sameEmail(existing, person)));
    } else {
      onChange([...selected, { name: person.name, email: person.email }]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        className="w-fit"
        icon={<Users className="size-3.5" />}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {selected.length > 0 ? t("commit.coauthors.count", { count: selected.length }) : t("commit.coauthors.label")}
      </Button>
      {open ? (
        <div id={listId} className="flex flex-col gap-1.5 rounded-md border border-line bg-canvas p-2">
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("commit.coauthors.filter")}
            aria-label={t("commit.coauthors.filter")}
            className="h-7 w-full rounded-md border border-line bg-surface px-2 text-xs text-fg focus-visible:border-accent focus-visible:outline-none"
          />
          {people.isLoading ? (
            <p className="text-xs text-muted">{t("commit.coauthors.loading")}</p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-muted">{t("commit.coauthors.empty")}</p>
          ) : (
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto" aria-label={t("commit.coauthors.label")}>
              {visible.map((person) => (
                <li key={person.email}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-subtle">
                    <input
                      type="checkbox"
                      checked={selected.some((existing) => sameEmail(existing, person))}
                      onChange={() => toggle(person)}
                      className="size-3.5 cursor-pointer accent-accent"
                    />
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-fg">{person.name}</span>{" "}
                      <span className="text-muted">{person.email}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
