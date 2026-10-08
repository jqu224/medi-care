import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { Observation } from "./model";
import { symptomScales, symptomValue, type SymptomKey } from "./symptoms";
export default function SymptomTrend({
  id,
  rows,
  labelOf,
  note = "",
}: {
  id: SymptomKey;
  rows: Observation[];
  labelOf?: (at: string) => string;
  note?: string;
}) {
  const scale = symptomScales[id];
  return (
    <div className="symptom-trend">
      <p>自评分级 · 0–3 档，不代表临床严重程度{note ? ` · ${note}` : ""}</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={rows.map((o) => ({
            date: labelOf ? labelOf(o.at) : o.at.slice(5).replace("T", " "),
            degree: o.symptom?.severity ?? null,
            label: symptomValue(o),
          }))}
          margin={{ left: 8, right: 12, top: 12, bottom: 4 }}
        >
          <CartesianGrid vertical={false} stroke="#e4ebe7" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={35} />
          <YAxis
            domain={[0, 3]}
            ticks={[0, 1, 2, 3]}
            tickFormatter={(n) => scale.labels[n]}
            width={56}
            tick={{ fontSize: 11 }}
          />
          <Tooltip formatter={(v) => scale.labels[Number(v)]} />
          <Line
            name="自评程度"
            type="stepAfter"
            dataKey="degree"
            stroke="#146b60"
            strokeWidth={2}
            dot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {rows.some((o) => o.symptom?.severity === undefined) && (
        <small>旧记录或未记录程度不绘制分值，不补零，也不跨缺失值连线</small>
      )}
    </div>
  );
}
