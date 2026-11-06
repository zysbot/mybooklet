const TZ = "Asia/Taipei";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function parts(d: Date): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const p: Record<string, string> = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { ...p, weekdayZh: WEEKDAYS[weekdayIndex], hour: p.hour === "24" ? "00" : p.hour };
}

/** 2026.11.21 */
export function formatDate(d: Date | string): string {
  const p = parts(new Date(d));
  return `${p.year}.${p.month}.${p.day}`;
}

/** 2026.11.21（六）19:30 */
export function formatShowTime(d: Date | string): string {
  const p = parts(new Date(d));
  return `${p.year}.${p.month}.${p.day}（${p.weekdayZh}）${p.hour}:${p.minute}`;
}

/** 2026.11.21 19:12 */
export function formatDateTime(d: Date | string): string {
  const p = parts(new Date(d));
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

/** 0128 */
export function formatSerial(n: number): string {
  return String(n).padStart(4, "0");
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
