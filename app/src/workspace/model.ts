import { SEED } from "../data/seed";
import {
  DEFAULT_SETTINGS,
  type MetricKey,
  type AlertSettings,
  SYMPTOMS,
  type SymptomId,
} from "../engine/config";
import { runEngine } from "../engine/alerts";
import { todayISO, addDaysISO } from "../lib/date";
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
export type Patient = {
  settings?: AlertSettings;
  id: string;
  name: string;
  description: string;
  monitors: Monitor[];
  observations: Observation[];
  events: CareEvent[];
  plans: CarePlan[];
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
  { id: "fatigue", name: "精神差", unit: "", type: "boolean" },
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
export function seedDatabase(): Database {
  const first: Patient = {
    id: "p1",
    name: "小宇",
    description: "7 岁 · sJIA 随访",
    monitors: [monitor("sjia"), monitor("mas")],
    observations: [],
    events: [],
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
      monitors: [monitor("diabetes")],
      observations: [],
      events: [],
      plans: [],
    },
    {
      id: "p3",
      name: "周宁",
      description: "58 岁 · 心脏健康随访",
      monitors: [monitor("heart")],
      observations: [],
      events: [],
      plans: [],
    },
  ];
  for (const p of others)
    for (let i = 20; i >= 0; i--) {
      const day = addDaysISO(todayISO(), -i);
      const vals =
        p.id === "p2"
          ? {
              glucose: String((6.5 + Math.sin(i) * 0.5).toFixed(1)),
              bp: "124/78",
            }
          : {
              hr: String(70 + Math.round(Math.sin(i) * 5)),
              weight: String((68 + Math.sin(i) * 0.3).toFixed(1)),
              bp: "122/76",
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
  const days = [
    ...new Set(p.observations.map((o) => o.at.slice(0, 10))),
  ].sort();
  const logs = days.map((date) => ({
    date,
    temps: series.temp.filter((o) => o.date === date).map((o) => o.value),
    symptoms: p.observations
      .filter(
        (o) =>
          o.at.slice(0, 10) === date && o.value === "是" && keys.has(o.metric),
      )
      .map((o) => o.metric as SymptomId),
    steroidMg: 0,
    bio: false,
    medDone: false,
  }));
  return runEngine({
    data: { series, logs, events: [] },
    settings: p.settings ?? DEFAULT_SETTINGS,
  });
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
export function seriesFor(
  p: Patient,
  metric: string,
  start: string,
  end: string,
  period: string,
  context = "",
) {
  const rows = p.observations
    .filter(
      (o) =>
        o.metric === metric &&
        o.at.slice(0, 10) >= start &&
        o.at.slice(0, 10) <= end &&
        (!context || o.context === context),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  if (metric !== "temp" || period === "日") return rows;
  const map = new Map<string, Observation>();
  for (const o of rows) {
    const day = o.at.slice(0, 10);
    if (!map.has(day) || Number(map.get(day)!.value) < Number(o.value))
      map.set(day, o);
  }
  return [...map.values()];
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
