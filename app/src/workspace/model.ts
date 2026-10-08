import { SEED } from "../data/seed";
import {
  DEFAULT_SETTINGS,
  type MetricKey,
  type AlertSettings,
  SYMPTOMS,
  type SymptomId,
} from "../engine/config";
import { runEngine } from "../engine/alerts";
import type { MedEvent } from "../data/seed";
import { todayISO, addDaysISO } from "../lib/date";
import type { ScanRecord } from "./scanSession";
export type Role = "patient" | "family" | "doctor";
export type Actor = { role: Role; name: string; patientIds: string[] };
export type Metric = {
  id: string;
  name: string;
  unit: string;
  type: "number" | "boolean" | "text" | "bp";
  custom?: boolean;
};
export type Monitor = {
  id: string;
  name: string;
  preset: string;
  metrics: string[];
  active: boolean;
};
export type Observation = {
  id: string;
  group: string;
  metric: string;
  value: string;
  context: string;
  at: string;
  created: string;
  source: string;
  author: string;
  symptom?: {
    severity?: 0 | 1 | 2 | 3;
    impacts: string[];
    parts: string[];
    note: string;
  };
};
export type CareEvent = {
  id: string;
  type: string;
  at: string;
  created: string;
  author: string;
  drug: string;
  dose: string;
  unit: string;
  route: string;
  hospital: string;
  institution: string;
  note: string;
  monitors: string[];
  planId?: string;
};
export type CarePlan = {
  id: string;
  title: string;
  type: string;
  dose: string;
  unit: string;
  date: string;
  active: boolean;
};
export type BodyProfile = {
  sex: "" | "男" | "女";
  heightCm: number | null;
  weightKg: number | null;
};
export type BenchmarkLine = {
  low?: number;
  high?: number;
  sysLow?: number;
  sysHigh?: number;
  diaLow?: number;
  diaHigh?: number;
};
export type Benchmarks = Record<string, BenchmarkLine>;
export type Patient = {
  settings?: AlertSettings;
  id: string;
  name: string;
  description: string;
  profile: BodyProfile;
  benchmarks: Benchmarks;
  monitors: Monitor[];
  observations: Observation[];
  events: CareEvent[];
  plans: CarePlan[];
  scans?: ScanRecord[];
};
export type Database = { version: 2; metrics: Metric[]; patients: Patient[] };
export const KEY = "nuanshao:workspace:v2";
export const uid = () => crypto.randomUUID();
export const now = () => {
  const d = new Date();
  return `${todayISO()}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const metrics: Metric[] = [
  ["temp", "体温", "℃"],
  ["ferritin", "铁蛋白", "ng/mL"],
  ["platelet", "血小板", "×10⁹/L"],
  ["fibrinogen", "纤维蛋白原", "g/L"],
  ["ast", "AST", "U/L"],
  ["tg", "甘油三酯", "mg/dL"],
  ["ldh", "LDH", "U/L"],
  ["hr", "心率", "次/分"],
  ["weight", "体重", "kg"],
  ["glucose", "血糖", "mmol/L"],
  ["a1c", "HbA1c", "%"],
].map(([id, name, unit]) => ({ id, name, unit, type: "number" }));
metrics.push(
  { id: "bp", name: "血压", unit: "mmHg", type: "bp" },
  { id: "rash", name: "皮疹", unit: "", type: "boolean" },
  { id: "joint", name: "关节肿痛", unit: "", type: "boolean" },
  { id: "fatigue", name: "精神状态", unit: "", type: "boolean" },
);
for (const symptom of SYMPTOMS) {
  if (!metrics.some((m) => m.id === symptom.id))
    metrics.push({
      id: symptom.id,
      name: symptom.label,
      unit: "",
      type: "boolean",
    });
}
export const presets = [
  {
    id: "sjia",
    name: "sJIA",
    metrics: ["temp", "rash", "joint", "fatigue", "ferritin", "platelet"],
  },
  {
    id: "mas",
    name: "MAS 监控",
    metrics: ["temp", "ferritin", "platelet", "fibrinogen", "ast", "tg", "ldh"],
  },
  { id: "heart", name: "心脏相关监控", metrics: ["bp", "hr", "weight"] },
  { id: "diabetes", name: "糖尿病", metrics: ["glucose", "a1c", "bp"] },
];
export const eventTypes = [
  "服药",
  "打针",
  "输液",
  "住院",
  "出院",
  "复诊",
  "调药",
  "其他",
];
export function actorFor(role: Role): Actor {
  return {
    role,
    name:
      role === "patient"
        ? "小宇"
        : role === "family"
          ? "林女士（家属）"
          : "陈医生",
    patientIds: role === "patient" ? ["p1"] : ["p1", "p2", "p3"],
  };
}
function monitor(preset: string): Monitor {
  const p = presets.find((p) => p.id === preset)!;
  return { ...p, preset, id: uid(), metrics: [...p.metrics], active: true };
}
const EMPTY_BODY: BodyProfile = { sex: "", heightCm: null, weightKg: null };
const DEMO_BODY: Record<string, BodyProfile> = {
  p1: { sex: "男", heightCm: 122, weightKg: 23 },
  p2: { sex: "男", heightCm: 172, weightKg: 70 },
  p3: { sex: "女", heightCm: 160, weightKg: 68 },
};
const DEMO_BENCHMARKS: Record<string, Benchmarks> = {
  p1: {
    temp: { high: 37.3 },
    ferritin: { high: 684 },
    platelet: { low: 181 },
    fibrinogen: { low: 3.6 },
    ast: { high: 48 },
    tg: { high: 156 },
    ldh: { high: 800 },
  },
  p2: {
    glucose: { high: 7.8 },
    a1c: { high: 7 },
    bp: { sysLow: 90, sysHigh: 140, diaLow: 60, diaHigh: 90 },
  },
  p3: {
    hr: { low: 60, high: 100 },
    bp: { sysLow: 90, sysHigh: 140, diaLow: 60, diaHigh: 90 },
    weight: { low: 64, high: 71 },
  },
};
function bodyFor(id: string): BodyProfile {
  return { ...(DEMO_BODY[id] ?? EMPTY_BODY) };
}
function benchmarksFor(id: string): Benchmarks {
  return structuredClone(DEMO_BENCHMARKS[id] ?? {});
}
export function seedDatabase(): Database {
  const first: Patient = {
    id: "p1",
    name: "小宇",
    description: "7 岁 · sJIA 随访",
    profile: bodyFor("p1"),
    benchmarks: benchmarksFor("p1"),
    monitors: [monitor("sjia"), monitor("mas")],
    observations: [],
    events: [],
    scans: [],
    plans: [
      {
        id: "plan1",
        title: "泼尼松",
        type: "服药",
        dose: "7.5",
        unit: "mg",
        date: todayISO(),
        active: true,
      },
    ],
  };
  for (const [key, points] of Object.entries(SEED.series))
    for (const p of points)
      first.observations.push({
        id: uid(),
        group: `seed-${p.date}`,
        metric: key,
        value: String(p.value),
        context: "",
        at: p.date,
        created: p.date,
        source: p.source,
        author: "演示数据",
      });
  first.events = SEED.events.map((e) => ({
    id: uid(),
    type: e.type === "visit" ? "复诊" : e.type === "steroid" ? "调药" : "其他",
    at: e.date,
    created: e.date,
    author: "演示数据",
    drug: "",
    dose: "",
    unit: "",
    route: "",
    hospital: "未注明",
    institution: "",
    note: e.label,
    monitors: [],
  }));
  const others: Patient[] = [
    {
      id: "p2",
      name: "林安",
      description: "42 岁 · 糖尿病随访",
      profile: bodyFor("p2"),
      benchmarks: benchmarksFor("p2"),
      monitors: [monitor("diabetes")],
      observations: [],
      events: [],
      scans: [],
      plans: [],
    },
    {
      id: "p3",
      name: "周宁",
      description: "58 岁 · 心脏健康随访",
      profile: bodyFor("p3"),
      benchmarks: benchmarksFor("p3"),
      monitors: [monitor("heart")],
      observations: [],
      events: [],
      scans: [],
      plans: [],
    },
  ];
  for (const p of others)
    for (let i = 20; i >= 0; i--) {
      const day = addDaysISO(todayISO(), -i);
      const outlier = i === 0;
      const vals =
        p.id === "p2"
          ? {
              glucose: outlier
                ? "9.4"
                : String((6.5 + Math.sin(i) * 0.5).toFixed(1)),
              bp: "124/78",
            }
          : {
              hr: outlier ? "112" : String(70 + Math.round(Math.sin(i) * 5)),
              weight: outlier
                ? "72.4"
                : String((68 + Math.sin(i) * 0.3).toFixed(1)),
              bp: outlier ? "158/96" : "122/76",
            };
      for (const [metric, value] of Object.entries(vals))
        p.observations.push({
          id: uid(),
          group: `seed-${day}`,
          metric,
          value: value!,
          context: metric === "glucose" ? "空腹" : "",
          at: day + "T08:00",
          created: day,
          source: "家属自录",
          author: "演示数据",
        });
    }
  return { version: 2, metrics: [...metrics], patients: [first, ...others] };
}
export function loadDatabase(
  storage: Pick<Storage, "getItem" | "setItem">,
): Database {
  const raw = storage.getItem(KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (
      parsed.version !== 2 ||
      !Array.isArray(parsed.patients) ||
      !Array.isArray(parsed.metrics)
    )
      throw Error("本地数据格式无法读取，请先备份本地数据");
    parsed.metrics = parsed.metrics.map((m: Metric) =>
      m.id === "fatigue" ? { ...m, name: "精神状态" } : m,
    );
    for (const p of parsed.patients as Patient[]) {
      if (!p.profile) p.profile = bodyFor(p.id);
      if (!p.benchmarks) p.benchmarks = benchmarksFor(p.id);
      if (!p.scans) p.scans = [];
    }
    return parsed;
  }
  const db = seedDatabase();
  const oldLogs = storage.getItem("sjia:user-logs:v1");
  const oldLabs = storage.getItem("sjia:user-labs:v1");
  const oldSettings = storage.getItem("sjia:settings:v1");
  if (oldLogs || oldLabs || oldSettings) {
    storage.setItem(
      "nuanshao:legacy-backup",
      JSON.stringify({
        logs: oldLogs,
        labs: oldLabs,
        settings: storage.getItem("sjia:settings:v1"),
      }),
    );
    const p = db.patients[0];
    if (oldSettings)
      p.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(oldSettings) };
    const logs = JSON.parse(oldLogs || "[]") as {
      date: string;
      temps: number[];
      symptoms: string[];
      medDone: boolean;
      steroidMg: number;
    }[];
    for (const l of logs) {
      p.observations = p.observations.filter(
        (o) => !(o.metric === "temp" && o.at.slice(0, 10) === l.date),
      );
      for (const v of l.temps)
        p.observations.push({
          id: uid(),
          group: `legacy-${l.date}`,
          metric: "temp",
          value: String(v),
          context: "",
          at: l.date,
          created: l.date,
          source: "家属自录",
          author: "旧版记录",
        });
      for (const s of l.symptoms)
        if (metrics.some((m) => m.id === s))
          p.observations.push({
            id: uid(),
            group: `legacy-${l.date}`,
            metric: s,
            value: "是",
            context: "",
            at: l.date,
            created: l.date,
            source: "家属自录",
            author: "旧版记录",
          });
      if (l.medDone)
        p.events.push({
          id: uid(),
          type: "服药",
          at: l.date,
          created: l.date,
          author: "旧版记录",
          drug: "泼尼松",
          dose: String(l.steroidMg),
          unit: "mg",
          route: "",
          hospital: "未注明",
          institution: "",
          note: "旧版迁移",
          monitors: [],
        });
    }
    const labs = JSON.parse(oldLabs || "[]") as {
      key: string;
      point: { date: string; value: number; source: string };
    }[];
    for (const l of labs)
      p.observations.push({
        id: uid(),
        group: uid(),
        metric: l.key,
        value: String(l.point.value),
        context: "",
        at: l.point.date,
        created: l.point.date,
        source: l.point.source,
        author: "旧版记录",
      });
  }
  storage.setItem(KEY, JSON.stringify(db));
  return db;
}
export function allowedPatients(db: Database, actor: Actor) {
  return db.patients.filter((p) => actor.patientIds.includes(p.id));
}
export function mutatePatient(
  db: Database,
  actor: Actor,
  id: string,
  update: (p: Patient) => void,
): Database {
  if (actor.role === "doctor" || !actor.patientIds.includes(id))
    throw Error("当前身份没有写入此患者资料的权限");
  const next = structuredClone(db);
  const p = next.patients.find((p) => p.id === id);
  if (!p) throw Error("患者不存在");
  update(p);
  return next;
}
export function commit(storage: Pick<Storage, "setItem">, db: Database) {
  storage.setItem(KEY, JSON.stringify(db));
}
export function alertsFor(p: Patient) {
  const active = p.monitors.filter(
    (m) => m.active && ["sjia", "mas"].includes(m.preset),
  );
  if (!active.length) return [];
  const keys = new Set(active.flatMap((m) => m.metrics));
  const series = Object.fromEntries(
    ["temp", "ferritin", "platelet", "fibrinogen", "ast", "tg", "ldh"].map(
      (k) => [
        k,
        p.observations
          .filter((o) => o.metric === k && keys.has(k))
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((o) => ({
            date: o.at.slice(0, 10),
            value: Number(o.value),
            source: "手录" as const,
          })),
      ],
    ),
  ) as typeof SEED.series;
  /* R8 需要的炎症指标不在 MAS 目录内，是扫描录入时建的自定义指标。
     引擎 series 类型固定为 7 个主指标，这里另取一份按名匹配的序列传下去。 */
  const inflammationSeries = p.observations
    .filter(
      (o) => keys.has(o.metric) && isInflammationMetric(o.metric) && Number.isFinite(Number(o.value)),
    )
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((o) => ({
      date: o.at.slice(0, 10),
      value: Number(o.value),
      metricName: o.metric,
    }));
  const days = [
    ...new Set(p.observations.map((o) => o.at.slice(0, 10))),
  ].sort();
  const logs = days.map((date) => ({
    date,
    temps: series.temp.filter((o) => o.date === date).map((o) => o.value),
    symptoms: p.observations
      .filter(
        (o) =>
          o.at.slice(0, 10) === date &&
          (o.value === "是" || (o.symptom?.severity ?? 0) > 0) &&
          keys.has(o.metric),
      )
      .map((o) => o.metric as SymptomId),
    steroidMg: 0,
    bio: false,
    medDone: false,
  }));
  return runEngine({
    data: { series, logs, events: engineEvents(p.events), inflammation: inflammationSeries },
    settings: p.settings ?? DEFAULT_SETTINGS,
  });
}

/**
 * 炎症指标名称白名单。CRP / 血沉 / 白细胞不在 MAS 主指标目录内，
 * 是扫描化验单时以自定义指标建库的（见 reference/case-ref/README.md）。
 * 只按名称匹配，避免为每种检验单再扩一套阈值。
 */
const INFLAMMATION_RE = /crp|c[-_]?反应蛋白|血沉|沉降率|esr|白细胞|wbc|中性粒|neut/i;

export function isInflammationMetric(metricId: string): boolean {
  return INFLAMMATION_RE.test(metricId);
}

/**
 * 工作台事件（中文 type）→ 引擎 MedEvent（英文 type）的映射。
 *
 * R7 激素减量窗口依赖 type === 'steroid'，此前工作台从未把事件传进引擎，
 * 该规则一直是死代码。这里做保守映射：只有能确定是激素用药/减量的事件才标
 * steroid，无法判定的一律不标——宁可漏提醒，也不误报。
 */
/* 只认糖皮质激素。刻意排除「生长激素」——它同样含「激素」二字，
   但不是 R7 关心的减量药物，误判会开出一个不存在的观察窗口。 */
const STEROID_HINTS =
  /泼尼松|甲泼|地塞米松|强的松|醋酸|泼尼龙|曲安奈德|倍他米松|氢化可的松|糖皮质|肾上腺皮质激素/i;

export function engineEvents(events: CareEvent[]): MedEvent[] {
  const out: MedEvent[] = [];
  for (const e of events) {
    const haystack = `${e.drug} ${e.note} ${e.type}`;
    const looksSteroid = STEROID_HINTS.test(haystack);
    if (e.type === "调药") {
      if (looksSteroid)
        out.push({ date: e.at.slice(0, 10), type: "steroid", label: medicationLabel(e) });
      // 非激素的调药不映射：R7 只关心激素减量窗口
    } else if (e.type === "服药" || e.type === "打针") {
      if (looksSteroid)
        out.push({ date: e.at.slice(0, 10), type: "steroid", label: medicationLabel(e) });
    } else if (e.type === "住院") {
      out.push({ date: e.at.slice(0, 10), type: "hospital", label: e.hospital || "住院" });
    } else if (e.type === "复诊") {
      out.push({ date: e.at.slice(0, 10), type: "visit", label: e.hospital || "复诊" });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function medicationLabel(e: CareEvent): string {
  const dose = [e.dose, e.unit].filter(Boolean).join("");
  return e.drug ? `${e.type}${dose ? ` ${dose}` : ""}` : e.type;
}
export function periodRange(date: string, period: string): [string, string] {
  if (period === "日") return [date, date];
  const d = new Date(date + "T12:00:00");
  if (period === "周") {
    const start = addDaysISO(date, -((d.getDay() + 6) % 7));
    return [start, addDaysISO(start, 6)];
  }
  return [
    date.slice(0, 7) + "-01",
    `${date.slice(0, 7)}-${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}`,
  ];
}
export const trendRanges = [
  "本周",
  "本月",
  "近 90 天",
  "近 180 天",
  "近 365 天",
  "全部",
] as const;
export type TrendRange = (typeof trendRanges)[number];
export function isTrendRange(value: unknown): value is TrendRange {
  return (
    typeof value === "string" &&
    (trendRanges as readonly string[]).includes(value)
  );
}
const rollingDays: Record<string, number> = {
  "近 90 天": 89,
  "近 180 天": 179,
  "近 365 天": 364,
};
/** 本周与本月对齐日历，其余为截至今天的滚动窗口，全部从最早一条记录起算。 */
export function trendRange(
  range: TrendRange,
  today = todayISO(),
  earliest = "",
): [string, string] {
  if (range === "全部")
    return [earliest && earliest <= today ? earliest : today, today];
  if (range === "本周") {
    const d = new Date(today + "T12:00:00");
    return [addDaysISO(today, -((d.getDay() + 6) % 7)), today];
  }
  if (range === "本月") return [today.slice(0, 7) + "-01", today];
  return [addDaysISO(today, -rollingDays[range]), today];
}
/** 图表粒度：每个点代表一天的所有记录、一周或一个月的聚合值。 */
export const grains = ["日", "周", "月"] as const;
export type Grain = (typeof grains)[number];
export function isGrain(value: unknown): value is Grain {
  return (grains as readonly string[]).includes(value as string);
}
/** 记录所属周期：日期本身 / 该周周一 / 该月。 */
export function bucketKey(at: string, grain: Grain): string {
  const date = at.slice(0, 10);
  if (grain === "日") return date;
  const d = new Date(date + "T12:00:00");
  if (grain === "周") return addDaysISO(date, -((d.getDay() + 6) % 7));
  return date.slice(0, 7);
}
/** 周期最后一天，月度窗口与工具提示用。 */
export function bucketEnd(key: string, grain: Grain): string {
  if (grain === "日") return key;
  if (grain === "周") return addDaysISO(key, 6);
  const [y, m] = key.split("-").map(Number);
  return `${key}-${new Date(y, m, 0).getDate()}`;
}
/** 坐标轴刻度：单日窗口按时刻，否则按日期（跨年补年份）；周取周一，月取年月。 */
export function trendTick(at: string, grain: Grain, windowDays: number): string {
  const date = at.slice(0, 10);
  if (grain === "日") {
    if (windowDays <= 1) return at.slice(11, 16) || date.slice(5);
    return windowDays > 365 ? date.slice(2) : date.slice(5);
  }
  const key = bucketKey(date, grain);
  if (grain === "周") return windowDays > 365 ? key.slice(2) : key.slice(5);
  return key.slice(0, 7);
}
/** 工具提示标题：单日窗口给时刻，聚合窗口把周期写全，避免把周/月点当成某一天。 */
export function trendFull(at: string, grain: Grain, windowDays = 30): string {
  const date = at.slice(0, 10);
  if (grain === "日")
    return windowDays <= 1
      ? at.slice(11, 16) || date
      : date + (at.length > 10 ? " " + at.slice(11, 16) : "");
  const key = bucketKey(date, grain);
  if (grain === "周")
    return `${key.slice(5)} 至 ${bucketEnd(key, "周").slice(5)}（周）`;
  const [y, m] = key.split("-").map(Number);
  return `${y}年${m}月`;
}
const finerGrain: Record<Grain, Grain> = { 日: "日", 周: "日", 月: "周" };
/** 一个周期一个点：体温与自评症状取周期内最高，其余取周期内最后一次实测。 */
function bucketize(rows: Observation[], metric: string, grain: Grain) {
  const score = (o: Observation) =>
    metric === "temp"
      ? Number(o.value)
      : (o.symptom?.severity ?? Number.NEGATIVE_INFINITY);
  const buckets = new Map<string, Observation>();
  for (const o of rows) {
    const key = bucketKey(o.at, grain);
    const prev = buckets.get(key);
    if (!prev || score(o) >= score(prev)) buckets.set(key, o);
  }
  return [...buckets.values()];
}
/**
 * 窗口太短时自动把粒度细化到能画出趋势为止（月→周→日），
 * 免得「本月 + 按月」退化成孤零零一个点。返回实际使用的粒度。
 */
export function seriesFor(
  p: Patient,
  metric: string,
  start: string,
  end: string,
  grain: Grain,
  context = "",
): { rows: Observation[]; grain: Grain } {
  const rows = p.observations
    .filter(
      (o) =>
        o.metric === metric &&
        o.at.slice(0, 10) >= start &&
        o.at.slice(0, 10) <= end &&
        (!context || o.context === context),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  /* 单日窗口保留每一条记录，画出这一天内的变化；其余一个周期一个点。 */
  if (grain === "日" && start === end) return { rows, grain };
  if (grain === "日") return { rows: bucketize(rows, metric, "日"), grain };
  const bucketed = bucketize(rows, metric, grain);
  return bucketed.length >= 2
    ? { rows: bucketed, grain }
    : seriesFor(p, metric, start, end, finerGrain[grain], context);
}
export function togglePlan(p: Patient, plan: CarePlan, author: string) {
  const found = p.events.find(
    (e) => e.planId === plan.id && e.at.slice(0, 10) === todayISO(),
  );
  if (found) {
    p.events = p.events.filter((e) => e.id !== found.id);
    return;
  }
  p.events.push({
    id: uid(),
    planId: plan.id,
    type: plan.type,
    drug: plan.title,
    dose: plan.dose,
    unit: plan.unit,
    at: now(),
    created: now(),
    author,
    hospital: "未注明",
    route: "",
    institution: "",
    note: "照护计划确认",
    monitors: [],
  });
}
export type LegacyMetricKey = MetricKey;
