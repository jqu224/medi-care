import {
  DEFAULT_SETTINGS,
  METRIC_MAP,
  effThreshold,
  type MetricKey,
} from "../engine/config";
import type {
  BenchmarkLine,
  Metric,
  Observation,
  Patient,
} from "./model";

export type BenchmarkHit = { exceeded: boolean; note: string };

function fmt(n: number) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function activeIds(patient: Patient) {
  return new Set(
    patient.monitors.filter((m) => m.active).flatMap((m) => m.metrics),
  );
}

/** sJIA/MAS rule lines scale with sensitivity. Other stored lines do not. */
function effectiveLine(patient: Patient, metricId: string, line: BenchmarkLine) {
  const rule = METRIC_MAP[metricId as MetricKey];
  if (!rule?.threshold) return line;
  const s = (patient.settings ?? DEFAULT_SETTINGS).sensitivity;
  const next = { ...line };
  if (rule.direction === "high" && next.high != null)
    next.high = effThreshold(next.high, s);
  if (rule.direction === "low" && next.low != null)
    next.low = effThreshold(next.low, s);
  return next;
}

function rateNumber(value: number, line: BenchmarkLine, unit: string): BenchmarkHit | null {
  if (line.high == null && line.low == null) return null;
  const over = line.high != null && value > line.high;
  const under = line.low != null && value < line.low;
  const u = unit ? ` ${unit}` : "";
  const note = over && !under
    ? `高于 ${fmt(line.high!)}${u}`
    : under && !over
      ? `低于 ${fmt(line.low!)}${u}`
      : over || under
        ? `超出 ${fmt(line.low!)}–${fmt(line.high!)}${u}`
        : "";
  return { exceeded: over || under, note };
}

function rateBp(value: string, line: BenchmarkLine): BenchmarkHit | null {
  const matched = value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!matched) return null;
  if (
    line.sysLow == null &&
    line.sysHigh == null &&
    line.diaLow == null &&
    line.diaHigh == null
  )
    return null;
  const sys = Number(matched[1]);
  const dia = Number(matched[2]);
  const bits: string[] = [];
  if (line.sysHigh != null && sys > line.sysHigh)
    bits.push(`收缩压高于 ${fmt(line.sysHigh)}`);
  if (line.sysLow != null && sys < line.sysLow)
    bits.push(`收缩压低于 ${fmt(line.sysLow)}`);
  if (line.diaHigh != null && dia > line.diaHigh)
    bits.push(`舒张压高于 ${fmt(line.diaHigh)}`);
  if (line.diaLow != null && dia < line.diaLow)
    bits.push(`舒张压低于 ${fmt(line.diaLow)}`);
  return { exceeded: bits.length > 0, note: bits.join("，") };
}

export function rateObservation(
  patient: Patient,
  observation: Observation,
  unit = "",
): BenchmarkHit | null {
  const line = patient.benchmarks?.[observation.metric];
  if (!line || !activeIds(patient).has(observation.metric)) return null;
  const effective = effectiveLine(patient, observation.metric, line);
  if (observation.metric === "bp") return rateBp(observation.value, effective);
  if (observation.value.trim() === "" || !Number.isFinite(Number(observation.value)))
    return null;
  return rateNumber(Number(observation.value), effective, unit);
}

function span(low?: number, high?: number) {
  if (low != null && high != null) return `${fmt(low)}–${fmt(high)}`;
  if (high != null) return `≤${fmt(high)}`;
  if (low != null) return `≥${fmt(low)}`;
  return "";
}

export function benchmarkLabel(line: BenchmarkLine, unit: string, bp = false) {
  const text = bp
    ? [span(line.sysLow, line.sysHigh), span(line.diaLow, line.diaHigh)]
        .filter(Boolean)
        .join("/")
    : span(line.low, line.high);
  return text && unit ? `${text} ${unit}` : text;
}

export function listedBenchmarks(patient: Patient, metrics: Metric[]) {
  const seen = new Set<string>();
  const rows: { id: string; name: string; text: string }[] = [];
  for (const monitor of patient.monitors.filter((m) => m.active)) {
    for (const id of monitor.metrics) {
      if (seen.has(id)) continue;
      seen.add(id);
      const def = metrics.find((m) => m.id === id);
      const line = patient.benchmarks?.[id];
      if (!def || !line || (def.type !== "number" && def.type !== "bp")) continue;
      const text = benchmarkLabel(
        effectiveLine(patient, id, line),
        def.unit,
        def.type === "bp",
      );
      if (text) rows.push({ id, name: def.name, text });
    }
  }
  return rows;
}

export function benchmarkFields(patient: Patient, metrics: Metric[]) {
  const seen = new Set<string>();
  const rows: Metric[] = [];
  for (const monitor of patient.monitors.filter((m) => m.active)) {
    for (const id of monitor.metrics) {
      if (seen.has(id)) continue;
      seen.add(id);
      const def = metrics.find((m) => m.id === id);
      if (def && (def.type === "number" || def.type === "bp")) rows.push(def);
    }
  }
  return rows;
}
