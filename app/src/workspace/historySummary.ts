import { rateObservation } from "./benchmark";
import type { CareEvent, Metric, Observation, Patient } from "./model";
export function summarizeHistory(
  patient: Patient,
  observations: Observation[],
  events: CareEvent[],
  metrics: Metric[],
) {
  const evaluated = observations.flatMap((o) => {
    const hit = rateObservation(
      patient,
      o,
      metrics.find((m) => m.id === o.metric)?.unit ?? "",
    );
    return hit ? [{ id: o.id, exceeded: hit.exceeded }] : [];
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
