import type { Metric, Patient } from "./model";
import { diffDays, todayISO } from "../lib/date";
export type CareTodo = {
  id: string;
  title: string;
  reason: string;
  kind: "plan" | "record";
  monitorId?: string;
  metricId?: string;
};
// Reminders track missing records, never prescribe laboratory testing or medication.
export function careTodos(
  p: Patient,
  metrics: Metric[],
  today = todayISO(),
): CareTodo[] {
  const plans: CareTodo[] = p.plans
    .filter(
      (plan) =>
        plan.active &&
        plan.date <= today &&
        !p.events.some((e) => e.planId === plan.id && e.at.startsWith(today)),
    )
    .map((plan) => ({
      id: plan.id,
      kind: "plan",
      title: plan.title,
      reason: `照护计划 · ${plan.date < today ? "已到计划日期" : "今天安排"} · 尚未记录完成`,
    }));
  const seen = new Set<string>();
  const records: CareTodo[] = [];
  for (const monitor of p.monitors.filter((m) => m.active)) {
    for (const id of monitor.metrics) {
      if (seen.has(id)) continue;
      seen.add(id);
      const metric = metrics.find((m) => m.id === id);
      if (!metric) continue;
      const latest = p.observations
        .filter((o) => o.metric === id && o.at.slice(0, 10) <= today)
        .map((o) => o.at.slice(0, 10))
        .sort()
        .at(-1);
      const days = latest ? diffDays(latest, today) : null;
      const daily = ["temp", "rash", "joint", "fatigue", "appetite"].includes(
        id,
      );
      if (days === 0 || (!daily && days !== null && days < 7)) continue;
      if (daily || days === null || days >= 7)
        records.push({
          id: `record:${id}`,
          kind: "record",
          monitorId: monitor.id,
          metricId: id,
          title: `${metric.name}${daily ? "反馈" : "记录待核对"}`,
          reason: daily
            ? days === null
              ? "尚无记录 · 可补充今天的实际情况"
              : `今天未记录 · 上次 ${days} 天前`
            : days === null
              ? "尚无记录 · 可补充已有测量或反馈"
              : `${days} 天未更新 · 按既定照护计划核对是否有新记录`,
        });
    }
  }
  return [...plans, ...records];
}
