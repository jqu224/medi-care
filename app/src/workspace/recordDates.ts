import type { Patient } from "./model";
import { todayISO } from "../lib/date";
const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export function recordDates(
  patient: Pick<Patient, "observations" | "events">,
  today = todayISO(),
) {
  const dates = [...patient.observations, ...patient.events]
    .map((record) => record.at.slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last)
    return { first: null, last: null, relative: "暂无记录", span: null };
  const age = dayNumber(today) - dayNumber(last);
  const relative =
    age === 0
      ? "今天"
      : age === 1
        ? "昨天"
        : age > 0
          ? `${age} 天前`
          : `${-age} 天后（未来日期）`;
  return { first, last, relative, span: dayNumber(last) - dayNumber(first) };
}
