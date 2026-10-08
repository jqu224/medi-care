import { DEFAULT_SETTINGS, METRICS, effThreshold } from "../engine/config";
import type { CareEvent, Metric, Observation, Patient } from "./model";
export function summarizeHistory(
  patient: Patient,
  observations: Observation[],
  events: CareEvent[],
  metrics: Metric[],
) {
  const keys = new Set(
    patient.monitors
      .filter((m) => m.active && ["sjia", "mas"].includes(m.preset))
      .flatMap((m) => m.metrics),
  );
  const settings = patient.settings ?? DEFAULT_SETTINGS;
  const evaluated = observations.flatMap((o) => {
    const rule = METRICS.find((m) => m.key === o.metric);
    const definition = metrics.find((m) => m.id === o.metric);
    if (
      !keys.has(o.metric) ||
      !rule ||
      rule.threshold === undefined ||
      !settings.weights[rule.key] ||
      definition?.unit !== rule.unit ||
      o.value.trim() === "" ||
      !Number.isFinite(Number(o.value))
    )
      return [];
    const threshold = effThreshold(rule.threshold, settings.sensitivity);
    return [
      {
        id: o.id,
        exceeded:
          rule.direction === "high"
            ? Number(o.value) > threshold
            : Number(o.value) < threshold,
      },
    ];
  });
  const sessions = new Set(
    observations.map((o) => `${o.at.slice(0, 10)}:${o.group || o.id}`),
  ).size;
  return {
    records: sessions + events.length,
    sessions,
    items: observations.length,
    events: events.length,
    admissions: events.filter((e) => e.type === "住院").length,
    infusions: events.filter((e) => e.type === "输液").length,
    assessed: evaluated.length,
    exceededIds: evaluated.filter((e) => e.exceeded).map((e) => e.id),
  };
}
