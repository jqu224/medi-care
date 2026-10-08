import { monthDates, shiftMonth } from "./calendarMath";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { todayISO } from "../lib/date";
import { periodRange } from "./model";
import type { Patient } from "./model";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
// Keep the full month grid; one selected date drives title, range and results.
export default function Calendar({
  patient,
  period,
  date,
  onChange,
}: {
  patient: Patient;
  period: string;
  date: string;
  onChange: (v: { period?: string; date?: string }) => void;
}) {
  const displayedMonth = date.slice(0, 7) + "-01";
  const [start, end] = periodRange(date, period);
  const days = monthDates(displayedMonth);
  const rows = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  const title = `${displayedMonth.slice(0, 4)}年${Number(displayedMonth.slice(5, 7))}月`;
  const stats = (d: string) => ({
    logs: new Set(
      patient.observations
        .filter((o) => o.at.startsWith(d))
        .map((o) => o.group),
    ).size,
    events: patient.events.filter((e) => e.at.startsWith(d)).length,
  });
  const selectDate = (d: string) => {
    onChange({ date: d });
  };
  return (
    <section
      className="calendar-shell fixed-month-calendar"
      aria-label="健康记录日历"
    >
      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button
            aria-label="上个月"
            onClick={() => onChange({ date: shiftMonth(date, -1) })}
          >
            <CaretLeft size={17} />
          </button>
          <button
            className="calendar-date-title"
            aria-label={`${title}，点击回到今天`}
            title="回到今天"
            onClick={() => {
              onChange({ date: todayISO() });
            }}
          >
            {title}
          </button>
          <button
            aria-label="下个月"
            onClick={() => onChange({ date: shiftMonth(date, 1) })}
          >
            <CaretRight size={17} />
          </button>
        </div>
        <div className="segmented" role="group" aria-label="选择粒度">
          <span
            className="segment-track"
            style={{
              transform: `translateX(${["日", "周", "月"].indexOf(period) * 100}%)`,
            }}
          />
          {["日", "周", "月"].map((p) => (
            <button
              type="button"
              key={p}
              aria-pressed={p === period}
              className={p === period ? "selected" : ""}
              onClick={() => onChange({ period: p })}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-weekdays">
        {weekdays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="stable-month-grid">
        {rows.map((row) => (
          <div className="calendar-week-row" key={row[0]}>
            {row.map((d) => {
              const s = stats(d);
              const inRange = d >= start && d <= end;
              const outside = d.slice(0, 7) !== displayedMonth.slice(0, 7);
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={`${d}，${s.logs} 次检测，${s.events} 条事件`}
                  aria-pressed={inRange}
                  className={[
                    "cal-day",
                    period !== "日" && inRange ? "range-selected" : "",
                    d === date ? "chosen" : "",
                    d === todayISO() ? "is-today" : "",
                    outside ? "outside" : "",
                  ].join(" ")}
                  onClick={() => selectDate(d)}
                >
                  <span className="day-number">{Number(d.slice(-2))}</span>
                  <span className="day-dots">
                    {s.logs > 0 && <i className="log-dot" />}
                    {s.events > 0 && <i className="event-dot" />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="calendar-caption">
        <span>
          <i className="log-dot" />
          检测 <i className="event-dot" />
          事件
        </span>
        <small>
          {period === "日" ? `已选 ${date}` : `已选 ${start} 至 ${end}`}
        </small>
      </div>
    </section>
  );
}
