/** All match times are shown in UAE time, whatever the viewer's device says. */
const TZ = "Asia/Dubai";

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const longDayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const keyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const stampFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "Sat 10 Oct" */
export const formatDay = (iso: string) => dayFormat.format(new Date(iso));
/** "Saturday 10 October" */
export const formatLongDay = (iso: string) => longDayFormat.format(new Date(iso));
/** "5:40 PM" */
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
/** "2026-10-10" in UAE time, for grouping matches by day. */
export const dayKey = (iso: string) => keyFormat.format(new Date(iso));
/** "Wed 7 Oct, 3:15 pm" */
export const formatStamp = (iso: string) => stampFormat.format(new Date(iso));

/** For <input type="date"> / <input type="time"> in UAE time. */
export function toDubaiInputs(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

/** Inverse of toDubaiInputs (UAE is UTC+4 all year). */
export function fromDubaiInputs(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 4, mm));
}
