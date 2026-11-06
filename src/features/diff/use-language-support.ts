import type { LanguageSupport } from "@codemirror/language";
import { useEffect, useState } from "react";
import { loadLanguageFor } from "@/shared/lib/syntax";

interface LoadedLanguage {
  path: string;
  support: LanguageSupport | null;
}

export function useLanguageSupport(path: string): LanguageSupport | null {
  const [loaded, setLoaded] = useState<LoadedLanguage>({ path, support: null });

  useEffect(() => {
    let cancelled = false;
    void loadLanguageFor(path).then((support) => {
      if (!cancelled) {
        setLoaded({ path, support });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return loaded.path === path ? loaded.support : null;
}
