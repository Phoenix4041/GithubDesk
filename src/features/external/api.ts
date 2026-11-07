import { call } from "@/shared/lib/tauri-client";
import type { EditorOption } from "@/shared/types/git";

export function listEditors(): Promise<EditorOption[]> {
  return call<EditorOption[]>("editors_list");
}

export function openInEditor(
  path: string,
  relative: string | null,
  editor: string,
  custom: string | null,
  line: number | null,
): Promise<void> {
  return call<void>("editor_open", { path, relative, editor, custom, line });
}

export function revealInFileManager(path: string, relative: string | null): Promise<void> {
  return call<void>("reveal_in_file_manager", { path, relative });
}
