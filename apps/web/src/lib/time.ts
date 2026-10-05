/** Compact relative time for lists: "now", "5m", "3h", "Yesterday", "12 Oct". */
export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
