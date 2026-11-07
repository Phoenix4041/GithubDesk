import { useQuery } from "@tanstack/react-query";
import { listEditors } from "./api";

export const editorsQueryKey = ["external", "editors"] as const;

export function useEditors() {
  return useQuery({
    queryKey: editorsQueryKey,
    queryFn: listEditors,
    staleTime: 60_000,
  });
}
