// deleted_at / created_at style timestamps are stored as SQLite's
// datetime('now'), i.e. UTC "YYYY-MM-DD HH:MM:SS" with no timezone marker
// — appending "Z" makes Date parse it as UTC instead of (incorrectly)
// treating it as already-local time.
export function formatDbTimestamp(value: string): string {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}