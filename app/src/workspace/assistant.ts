// 问助手的纯逻辑层：预备问题、上下文组装、对话历史存储。
// 抽成独立模块是为了能脱离 React 与网络单测，也是为了让隐私边界集中在一处。

import type { Patient } from "./model";
import type { StaticVerdict } from "../engine/staticScoring";

/* ────────────────────────── 预备问题 ──────────────────────────
   依据需求发起人小 Q 在会议纪要里的原话，不是产品经理的想象。
   「sJIA」一组的每一句都能追溯到 23:03 / 01:14:07 / 01:15:19 / 25:56 段。
   第一条是 23:03 的逐字原句——那正是他描述的「最常遇到的场景」。 */
const SJIA_QUESTIONS = [
  "有没有可能会有失血的风险？",
  "现在符合 HLH 八选几项了？",
  "够不够 5 条？不够的话差在哪？",
  "三系（白细胞、红细胞、血小板）最近怎么样？",
  "铁蛋白最近涨得有多快？",
  "炎症指标降下来了，是不是就好了？",
  "肝肾功能这两天有变化吗？",
  "减量之后又发热了，要紧吗？",
];

const HEART_QUESTIONS = ["血压记录怎么看？", "心率快和心悸是一回事吗？"];

const DIABETES_QUESTIONS = [
  "糖化血红蛋白和当天血糖有什么不同？",
  "生病日血糖为什么容易乱？",
];

/** 无匹配病种时的回落问题（概念解释类，不涉及任何病情判断） */
const GENERIC_QUESTIONS = [
  "铁蛋白这项检查在看什么？",
  "照护计划和实际发生的事，为什么要分开记？",
  "关节肿痛应该怎么记录？",
  "一般多久复查一次比较合适？",
];

/* ────────────────────── 预备问题分组 ──────────────────────
   一堆同权重的问题排在一起，家属看不出哪条跟自己今晚的担心有关。
   按 session 分组，每组一条 session line：
     第一组 = 当前病种真正关心的问题
     最后组 = 跟病种无关的健康问题，任何人都问得
   多个病种同时监控时，每个病种各成一组，MAS 类排在最前。 */

export type QuestionGroup = {
  id: string;
  label: string;
  questions: string[];
};

/* sJIA 与 MAS 是同一组问题（两者的判断框架就是一套），共用一个 id，
   否则两个监控同时开着时会重复出一段一模一样的 session */
const MAS_GROUP: QuestionGroup = {
  id: "sjia",
  label: "sJIA 与巨噬细胞活化综合征",
  questions: SJIA_QUESTIONS,
};

const GROUP_BY_PRESET: Record<string, QuestionGroup> = {
  sjia: MAS_GROUP,
  mas: MAS_GROUP,
  diabetes: { id: "diabetes", label: "血糖管理", questions: DIABETES_QUESTIONS },
  heart: { id: "heart", label: "心率与血压", questions: HEART_QUESTIONS },
};

/** 排在最后的通用组。跟病种无关，所以任何患者都能看到。 */
const GENERAL_GROUP: QuestionGroup = {
  id: "general",
  label: "一般健康与记录",
  questions: GENERIC_QUESTIONS,
};

/** 「全部」= 不限定病种，所有启用中的病种组都出 */
export const FOCUS_ALL = "all";

export function questionGroups(patient: Patient, focus?: string): QuestionGroup[] {
  const active = patient.monitors.filter((m) => m.active);
  /* focus 限定时只出那一组；「全部」或没传时出所有病种组 */
  const scoped = focus && focus !== FOCUS_ALL ? active.filter((m) => m.preset === focus) : active;
  const groups: QuestionGroup[] = [];
  const seen = new Set<string>();
  for (const m of scoped) {
    const g = m.preset ? GROUP_BY_PRESET[m.preset] : undefined;
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      groups.push(g);
    }
  }
  /* MAS 类先出：它和小 Q 说的「最常遇到的场景」对得上 */
  groups.sort((a, b) => Number(b.id === "sjia") - Number(a.id === "sjia"));
  groups.push(GENERAL_GROUP);
  return groups;
}

/** 扁平列表，给只需要「有哪些问题」的调用方用（测试、后续搜索） */
export function presetQuestions(patient: Patient, focus?: string): string[] {
  return questionGroups(patient, focus).flatMap((g) => g.questions);
}

/* 只认「整套 MAS 判断框架」层面的词，不把「铁蛋白」这种单项检查算进去——
   回落问题是纯概念解释，任何病种都问得，但不该被误判成 MAS 问题。 */
const MAS_KEYWORDS = /失血|噬血|HLH|八选|MAS\b|三系|炎症指标|减量|肝肾/iu;

/**
 * 「你关注的是 XX」里的 XX。
 *
 * 刻意用短名：标题已经在说「你关注的是」，再跟一长串病名就成了标题。
 * 需要完整病名时，问助手回答里会自己说清，这里只负责一眼可辨。
 */
export type FocusOption = { id: string; label: string };

/** 可切换的关注项。多个监控并存时每个病种一项。 */
export function focusOptions(patient: Patient): FocusOption[] {
  const seen = new Set<string>();
  const out: FocusOption[] = [];
  for (const m of patient.monitors) {
    if (!m.active || !m.preset || seen.has(m.preset)) continue;
    seen.add(m.preset);
    out.push({ id: m.preset, label: m.name });
  }
  if (out.length === 0) out.push({ id: FOCUS_ALL, label: "健康记录" });
  return out;
}

/** 默认落在 MAS 类上：它才是小 Q 说的「最常遇到的场景」 */
export function defaultFocus(patient: Patient): string {
  const options = focusOptions(patient);
  return options.find((o) => o.id === "sjia" || o.id === "mas")?.id ?? options[0].id;
}

export function focusLabel(patient: Patient, focus?: string): string {
  const options = focusOptions(patient);
  const hit = focus && options.find((o) => o.id === focus);
  if (hit) return hit.label;
  return options.find((o) => o.id === "sjia" || o.id === "mas")?.label ?? options[0].label;
}

/**
 * 副标题只说一件事：这些答案会用到上传的记录。
 * 不重复标题已经说过的「你关注的是什么」——标题下面再说一遍是废话。
 */
export const PROMPT_HINT = "下面的问题会结合上传的医疗记录来回答";

export function promptHint(): string {
  return PROMPT_HINT;
}

/** 隐私说明：说明外发哪些内容，用家属能听懂的话讲 */
export function privacyNote(window: ContextWindow): string {
  const range = window === CONTEXT_ALL ? "全部" : `近 ${window} 天`;
  return `提问时会把${range}记录的数值与趋势发送给配置的解析服务，用来让回答贴合孩子的实际情况，姓名、照片和病情描述不会发送`;
}

/**
 * 非 sJIA/MAS 病种不得出现 MAS 相关问题。
 * 与既有「非临床预设不继承 MAS 规则」保持同一条底线：
 * 糖尿病患者不该被问「有没有失血风险」。
 */
export function questionsAreSafe(patient: Patient): boolean {
  const active = patient.monitors.filter((m) => m.active);
  const isMas = active.some((m) => m.preset === "sjia" || m.preset === "mas");
  const qs = presetQuestions(patient);
  if (isMas) return true;
  return !qs.some((q) => MAS_KEYWORDS.test(q));
}

/* ────────────────────────── 上下文组装 ────────────────────────── */

export type Trend = "up" | "down" | "flat";

export type ContextObservation = {
  metric: string;
  latest: string;
  previous: string | null;
  direction: Trend;
  unit: string;
};

export type AssistantContext = {
  preset: string;
  window: ContextWindow;
  observations: ContextObservation[];
  alerts: { level: string; title: string }[];
  verdicts?: { standard: string; status: string; headline: string }[];
};

export const CONTEXT_DAYS = [7, 30, 90] as const;
export type ContextDays = (typeof CONTEXT_DAYS)[number];

/** 「全部」不参与天数裁剪，直接把患者所有记录送进上下文 */
export const CONTEXT_ALL = "all" as const;
export type ContextWindow = ContextDays | typeof CONTEXT_ALL;
export const CONTEXT_WINDOW_OPTIONS: { value: ContextWindow; label: string }[] = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
  { value: CONTEXT_ALL, label: "全部" },
];
export const DEFAULT_CONTEXT_DAYS: ContextDays = 30;

function trendOf(latest: number, previous: number | undefined): Trend {
  if (previous === undefined || !Number.isFinite(previous)) return "flat";
  if (latest > previous) return "up";
  if (latest < previous) return "down";
  return "flat";
}

/**
 * 只取数值与趋势，不含姓名、照片、诊断原文等自由文本。
 * patient.description 一律不进入上下文——它可能是家长写的病情描述，
 * 属于自由文本与个人信息，不该在没有明确告知的情况下外发。
 */
export function buildContext(opts: {
  patient: Patient;
  alerts?: { level: string; title: string }[];
  verdicts?: StaticVerdict[];
  window?: ContextWindow;
  today?: string;
  unitOf?: (metricId: string) => string;
}): AssistantContext {
  const { patient, alerts = [], verdicts, window: win = DEFAULT_CONTEXT_DAYS, unitOf } = opts;
  const days = typeof win === "number" ? win : DEFAULT_CONTEXT_DAYS;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  /* 「全部」不裁剪：只要 cutoff 为空串，任何日期都通过比较 */
  const cutoff =
    win === CONTEXT_ALL
      ? ""
      : new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000)
          .toISOString()
          .slice(0, 10);

  const numeric = patient.observations
    .filter(
      (o) =>
        (cutoff === "" || o.at.slice(0, 10) >= cutoff) &&
        Number.isFinite(Number(o.value)),
    )
    .sort((a, b) => a.at.localeCompare(b.at));

  const byMetric = new Map<string, { at: string; value: string }[]>();
  for (const o of numeric) {
    const arr = byMetric.get(o.metric) ?? [];
    arr.push({ at: o.at, value: o.value });
    byMetric.set(o.metric, arr);
  }

  const observations: ContextObservation[] = [];
  for (const [metric, points] of byMetric) {
    const last = points[points.length - 1];
    const prev = points.length > 1 ? points[points.length - 2] : undefined;
    const latest = Number(last.value);
    const previous = prev ? Number(prev.value) : undefined;
    observations.push({
      metric,
      latest: last.value,
      previous: prev ? prev.value : null,
      direction: trendOf(latest, previous),
      unit: unitOf?.(metric) ?? "",
    });
  }

  const active = patient.monitors.filter((m) => m.active);
  return {
    preset: active[0]?.preset ?? "",
    window: win,
    observations,
    alerts: alerts.map((a) => ({ level: a.level, title: a.title })),
    verdicts: verdicts?.map((v) => ({
      standard: v.standard,
      status: v.status,
      headline: v.headline,
    })),
  };
}

/** 系统提示：只解释与引导，不诊断、不建议用药或干预时机。 */
export const ASSISTANT_GUARDRAIL = [
  "你在这个照护工具里回答家属的提问。",
  "只做解释和引导，不做诊断，不给用药、加量、减量或干预时机的建议。",
  "所有判断只能依据下面提供的记录与阈值；数据不足时直接说「这项还没记录」，不要推测。",
  "回答用家常话，句子短一些；末尾提醒最终的判断要交给医生。",
].join("\n");

/* ────────────────────────── 对话历史 ────────────────────────── */

export type Turn = { role: "user" | "assistant"; text: string };

export type Conversation = {
  id: string;
  startedAt: string;
  updatedAt: string;
  title: string;
  turns: Turn[];
};

export const HISTORY_LIMIT = 20;

/** 存储键按身份 + 患者隔离，家庭成员切换患者时不得看到彼此对话。 */
export function historyKey(role: string, patientId: string): string {
  return `nuanshao:assistant:v1:${role}:${patientId}`;
}

export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 超出上限时丢弃最旧的；不做分页，避免家属为了找一条记录而翻页。 */
export function capConversations(list: Conversation[]): Conversation[] {
  return sortConversations(list).slice(0, HISTORY_LIMIT);
}

export function conversationTitle(turns: Turn[]): string {
  const first = turns.find((t) => t.role === "user");
  if (!first) return "未命名对话";
  return first.text.length > 24 ? `${first.text.slice(0, 24)}…` : first.text;
}

/**
 * 校验从 localStorage 读回的历史：结构不对就当作没有历史，
 * 不能让一段坏数据把整个问助手页面白屏。
 */
export function parseHistory(raw: string | null): Conversation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ok = parsed.filter(
      (c): c is Conversation =>
        c &&
        typeof c.id === "string" &&
        typeof c.updatedAt === "string" &&
        Array.isArray(c.turns) &&
        c.turns.every(
          (t: Turn) =>
            t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string",
        ),
    );
    return capConversations(ok);
  } catch {
    return [];
  }
}

/* ────────────────────── 历史读写（可注入存储） ──────────────────────
   从组件里抽出来是为了能脱离 React 与 localStorage 单测「写入→恢复」这条链路。
   历史对话是可选项：读失败当没历史，写失败只提示，都不该让问答本身不可用。 */

/** 只用到 localStorage 的两个方法，便于在测试里换成内存实现 */
export type HistoryStorage = Pick<Storage, "getItem" | "setItem">;

export function loadHistory(storage: HistoryStorage, role: string, patientId: string): Conversation[] {
  try {
    return parseHistory(storage.getItem(historyKey(role, patientId)));
  } catch {
    return [];
  }
}

/** 落盘一段新对话：封顶后写入。返回实际写入的列表，写失败返回 null。 */
export function saveHistory(
  storage: HistoryStorage,
  role: string,
  patientId: string,
  next: Conversation,
): Conversation[] | null {
  const capped = capConversations([next, ...loadHistory(storage, role, patientId)]);
  try {
    storage.setItem(historyKey(role, patientId), JSON.stringify(capped));
    return capped;
  } catch {
    return null;
  }
}

/* ────────────────────── 智能提问（两段式） ──────────────────────
   右上角那颗「Lucy」按钮点一下，就换一批问题。
   每条问题分两半：
     premise = 现象。这是孩子记录里真实发生的事，带具体数值。
     ask     = 问题。是要带去和医生讨论、或问清楚含义的问题。

   红线（与小 Q 原话一致）：ask 只问「怎么看、怎么问医生」，
   绝不给诊断、用药、加减量或干预时机的建议。
   生成是本地规则，不调模型——数值必须来自真实记录，不能让模型编。 */

export type SmartQuestion = { id: string; premise: string; ask: string };

const round = (n: number) => String(Math.round(n));

/** 取每个指标最近两次的数值，只取真的有数的 */
function latestPairs(patient: Patient): { metric: string; last: string; prev: string | null }[] {
  const byMetric = new Map<string, string[]>();
  for (const o of patient.observations) {
    if (!Number.isFinite(Number(o.value))) continue;
    const arr = byMetric.get(o.metric) ?? [];
    arr.push(o.value);
    byMetric.set(o.metric, arr);
  }
  return [...byMetric.entries()].map(([metric, values]) => ({
    metric,
    last: values[values.length - 1],
    prev: values.length > 1 ? values[values.length - 2] : null,
  }));
}

export function smartQuestions(opts: {
  patient: Patient;
  verdicts?: StaticVerdict[];
  nameOf?: (metricId: string) => string;
  unitOf?: (metricId: string) => string;
  alerts?: { level: string; title: string }[];
}): SmartQuestion[] {
  const { patient, verdicts = [], nameOf, unitOf = () => "", alerts = [] } = opts;
  const out: SmartQuestion[] = [];
  const name = (id: string) => nameOf?.(id) ?? id;
  const unit = (id: string) => unitOf?.(id) ?? "";

  /* ① 指标变化：最近两次有差值才说「变化」，没有就不编 */
  for (const p of latestPairs(patient)) {
    if (p.prev === null) continue;
    const a = Number(p.prev);
    const b = Number(p.last);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
    const rising = b > a;
    const pct = Math.round(Math.abs(b - a) / Math.max(Math.abs(a), 1) * 100);
    if (pct < 10) continue;
    out.push({
      id: `trend-${p.metric}`,
      premise: `${name(p.metric)}从 ${round(a)} ${unit(p.metric)} 变成 ${round(b)} ${unit(p.metric)}`,
      ask: rising
        ? `这次上升要跟医生说到什么程度？`
        : `这次下降算好转吗，还需要继续看什么？`,
    });
  }

  /* ② 判分位置：拿「还差几条」这种可讨论的位置去问，而不是问「我是不是」 */
  for (const v of verdicts) {
    if (v.standard === "ms-score" && v.score != null) {
      out.push({
        id: "ms-score",
        premise: `按 MS 评分表算出 ${v.score}，参考线是 −2.1`,
        ask: `这个分数和 HLH 八选五是两回事吗？`,
      });
      continue;
    }
    if (v.standard === "hlh-2004" && v.status !== "meet") {
      out.push({
        id: "hlh-gap",
        premise: `按 2004 年那套标准，8 条里现在已达标 ${v.metCount} 条`,
        ask: `离 5 条还差哪几条，复查时该先问医生哪些？`,
      });
    }
    if (v.assessableCount < v.criteria.length) {
      const missing = v.criteria.length - v.assessableCount;
      out.push({
        id: `gap-${v.standard}`,
        premise: `这套标准里有 ${missing} 项这次没结果`,
        ask: `这些项目去医院该怎么开单、要间隔多久？`,
      });
    }
  }

  /* ③ 用药事件：小 Q 反复问的「趋势和用药怎么合看」 */
  const meds = patient.events.filter((e) => e.type === "服药" || e.type === "打针" || e.type === "调药");
  if (meds.length > 0) {
    const last = meds[meds.length - 1];
    out.push({
      id: "medication",
      premise: `最近一次用药或调药记在 ${last.at.slice(0, 10)}`,
      ask: `用药前后这些指标的变化，医生一般会怎么看？`,
    });
  }

  /* ④ 正在响的警报 */
  const hot = alerts.find((a) => a.level === "red" || a.level === "amber");
  if (hot) {
    out.push({
      id: "alert",
      premise: `系统今天提示：${hot.title}`,
      ask: `这条提醒具体指什么情况，需要带什么去问医生？`,
    });
  }

  return out.slice(0, 12);
}

/** 从候选里取一组，offset 递增即「换一批」 */
export function rotateSmart(list: SmartQuestion[], offset: number, size = 3): SmartQuestion[] {
  if (list.length === 0) return [];
  const start = ((offset % list.length) + list.length) % list.length;
  return Array.from({ length: Math.min(size, list.length) }, (_, i) => list[(start + i) % list.length]);
}
