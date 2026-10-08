import { addDaysISO } from "../lib/date";
export function monthDates(date: string) {
  const first = date.slice(0, 7) + "-01";
  const offset = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  const d = new Date(first + "T12:00:00");
  const count = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) =>
    addDaysISO(first, i - offset),
  );
}
export function shiftMonth(date: string, delta: number) {
  const d = new Date(date + "T12:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  d.setDate(
    Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
