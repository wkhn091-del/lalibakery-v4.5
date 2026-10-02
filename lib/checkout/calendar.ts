/*
  Which days can be ordered for, from the owner's settings in the Studio:
    - not before `leadBusinessDays` working days from today (a working day: one the kitchen bakes,
      its capacity above 0, and not a blocked date). 0 means today, if today is a working day.
    - not after `maxAdvanceDays` from today
    - not a closed weekday (capacity 0) or a blocked date
    - not full: how many orders a day already has is the database's count (booked_counts);
      the customer sees only "available", "few left" or "full", never the numbers.
  A delivery also needs one of that weekday's delivery windows, when the owner set any.

  Dates are Israel's calendar days as YYYY-MM-DD; the arithmetic runs on UTC midnights, which
  have no daylight saving jumps. Pure functions: the checkout page, its server action and the
  availability route all use them.
*/
import type { DeliveryWindow, StoreSettings } from "@/lib/shop/normalize";

export type CalendarSettings = Pick<StoreSettings, "capacityByWeekday" | "leadBusinessDays" | "maxAdvanceDays" | "blockedDates" | "deliveryWindows">;
export type DayStatus = "free" | "few" | "full";
export type OpenDay = { date: string; status: DayStatus; windows: string[] };

/** Today's date in Israel */
export function israelDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const at = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const addDays = (date: string, days: number) => new Date(at(date) + days * 86_400_000).toISOString().slice(0, 10);
export const weekday = (date: string) => new Date(at(date)).getUTCDay();

export function isBlocked(date: string, blocked: CalendarSettings["blockedDates"]): boolean {
  return blocked.some((b) => b.from <= date && date <= b.to);
}

export function capacityOn(date: string, s: CalendarSettings): number {
  if (isBlocked(date, s.blockedDates)) return 0;
  return Math.max(0, s.capacityByWeekday[weekday(date)] ?? 0);
}

/** The first day that can be ordered for, or null when the kitchen has no working day ahead */
export function earliestDate(s: CalendarSettings, today: string): string | null {
  let date = today;
  let counted = 0;
  for (let i = 0; i <= s.maxAdvanceDays; i++, date = addDays(date, 1)) {
    if (capacityOn(date, s) === 0) continue;
    if (counted >= s.leadBusinessDays) return date;
    counted++;
  }
  return null;
}

export const lastDate = (s: CalendarSettings, today: string) => addDays(today, s.maxAdvanceDays);

export function windowsOn(date: string, windows: DeliveryWindow[]): DeliveryWindow[] {
  const day = weekday(date);
  return windows.filter((w) => w.days.includes(day));
}

/** "few left": the last place, or the last quarter of a big day */
export function statusOf(capacity: number, booked: number): DayStatus {
  const left = capacity - booked;
  if (left <= 0) return "full";
  return left <= Math.max(1, Math.floor(capacity / 4)) ? "few" : "free";
}

/** Every day in the ordering range that the kitchen works, with its status and delivery windows */
export function openDays(s: CalendarSettings, today: string, booked: ReadonlyMap<string, number>): OpenDay[] {
  const first = earliestDate(s, today);
  if (!first) return [];
  const last = lastDate(s, today);
  const days: OpenDay[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const capacity = capacityOn(date, s);
    if (capacity === 0) continue;
    days.push({ date, status: statusOf(capacity, booked.get(date) ?? 0), windows: windowsOn(date, s.deliveryWindows).map((w) => w.id) });
  }
  return days;
}

export type DateProblem = "date" | "closed" | "window";

/**
 * Whether an order may be placed for this day (fullness aside: the database decides that under a
 * lock). For a delivery, the window must be one of that weekday's, when the owner set windows.
 */
export function checkDate(s: CalendarSettings, today: string, date: string, delivery: { windowId: string | null } | null): { ok: true; capacity: number; window: DeliveryWindow | null } | { ok: false; problem: DateProblem } {
  const first = earliestDate(s, today);
  if (!first || date < first || date > lastDate(s, today)) return { ok: false, problem: "date" };
  const capacity = capacityOn(date, s);
  if (capacity === 0) return { ok: false, problem: "closed" };
  if (!delivery) return { ok: true, capacity, window: null };
  const windows = windowsOn(date, s.deliveryWindows);
  if (s.deliveryWindows.length === 0) return { ok: true, capacity, window: null };
  const window = windows.find((w) => w.id === delivery.windowId);
  return window ? { ok: true, capacity, window } : { ok: false, problem: "window" };
}
