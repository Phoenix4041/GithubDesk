export function isoToUnixSeconds(iso: string | null | undefined): number {
  if (!iso) {
    return 0;
  }
  const milliseconds = Date.parse(iso);
  return Number.isNaN(milliseconds) ? 0 : Math.floor(milliseconds / 1000);
}
