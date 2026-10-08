import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSISTANT_GUARDRAIL,
  CONTEXT_ALL,
  CONTEXT_WINDOW_OPTIONS,
  DEFAULT_CONTEXT_DAYS,
  HISTORY_LIMIT,
  buildContext,
  capConversations,
  conversationTitle,
  historyKey,
  parseHistory,
  focusLabel,
  presetQuestions,
  questionGroups,
  privacyNote,
  promptHint,
  questionsAreSafe,
  defaultFocus,
  focusOptions,
  rotateSmart,
  smartQuestions,
  type Conversation,
} from "../src/workspace/assistant";
import type { CareEvent, Monitor, Observation, Patient } from "../src/workspace/model";

function patient(monitors: Monitor[], observations: Observation[] = []): Patient {
  return {
    id: "p1",
    name: "小宇",
    description: "家长写的自由病情描述，绝不该出现在外发上下文里",
    profile: { sex: "男", heightCm: 122, weightKg: 23 },
    benchmarks: {},
    monitors,
    observations,
    events: [] as CareEvent[],
    plans: [],
  };
}

const sjia: Monitor = { id: "m1", name: "sJIA", preset: "sjia", metrics: ["temp", "ferritin"], active: true };
const diabetes: Monitor = { id: "m2", name: "糖尿病", preset: "diabetes", metrics: ["glucose"], active: true };
const heart: Monitor = { id: "m3", name: "心脏相关监控", preset: "heart", metrics: ["bp"], active: true };

function obs(metric: string, value: string, at: string): Observation {
  return {
    id: `${metric}-${at}`,
    group: metric,
    metric,
    value,
    context: "",
    at,
    created: at,
    source: "手录",
    author: "小宇妈妈",
  };
}

/* ────────────────────────── 预备问题 ────────────────────────── */

test("sJIA patients get the questions the requester actually asked", () => {
  const qs = presetQuestions(patient([sjia]));
  assert.match(qs[0], /失血/, "第一条必须是需求方 23:03 的原句场景");
  assert.ok(qs.some((q) => /八选/.test(q)), "应对应「8 条指标满足 5 条」");
  assert.ok(qs.some((q) => /三系/.test(q)));
  assert.ok(qs.some((q) => /铁蛋白/.test(q)));
  assert.ok(qs.some((q) => /炎症指标/.test(q)), "对应 23:03 的炎症指标回落场景");
});

test("each preset group gets its own questions", () => {
  assert.ok(presetQuestions(patient([diabetes])).some((q) => /糖化/.test(q)));
  assert.ok(presetQuestions(patient([heart])).some((q) => /血压/.test(q)));
});

test("an unmatched patient falls back to concept questions", () => {
  const qs = presetQuestions(patient([]));
  assert.ok(qs.length > 0);
  assert.ok(!qs.some((q) => /失血/.test(q)), "无 sJIA/MAS 时不得出现 MAS 问题");
});

test("non-MAS presets never receive MAS questions", () => {
  for (const m of [diabetes, heart]) {
    assert.equal(questionsAreSafe(patient([m])), true, `${m.preset} 不该拿到 MAS 问题`);
  }
  assert.equal(questionsAreSafe(patient([sjia])), true);
});

test("paused monitors do not resurrect MAS questions", () => {
  const paused: Monitor = { ...sjia, active: false };
  assert.equal(questionsAreSafe(patient([paused])), true);
  assert.ok(!presetQuestions(patient([paused])).some((q) => /失血/.test(q)));
});

test("day windows offer 7/30/90 plus an all option", () => {
  assert.deepEqual(
    CONTEXT_WINDOW_OPTIONS.map((o) => o.value),
    [7, 30, 90, CONTEXT_ALL],
  );
  assert.equal(DEFAULT_CONTEXT_DAYS, 30);
  assert.equal(
    CONTEXT_WINDOW_OPTIONS.find((o) => o.value === CONTEXT_ALL)!.label,
    "全部",
  );
});

test("the all window keeps every record regardless of age", () => {
  const p = patient(
    [sjia],
    [
      obs("ferritin", "100", "2024-01-01T09:00"),
      obs("ferritin", "500", "2026-10-04T09:00"),
    ],
  );
  const all = buildContext({ patient: p, alerts: [], today: "2026-10-06", window: CONTEXT_ALL });
  assert.equal(all.observations.find((o) => o.metric === "ferritin")!.previous, "100");
  assert.equal(all.window, CONTEXT_ALL);
});

test("the opening line names what the family is watching, and stays short", () => {
  assert.match(focusLabel(patient([sjia])), /sJIA/);
  assert.match(focusLabel(patient([diabetes])), /糖尿病/);
  assert.match(focusLabel(patient([heart])), /心脏|血压/);
  assert.equal(focusLabel(patient([])), "健康记录");
  /* 标题已经写了「你关注的是」，后面再跟一长串病名就成了标题 */
  assert.ok(
    focusLabel(patient([sjia])).length <= 12,
    `病种名要短，实际是「${focusLabel(patient([sjia]))}」`,
  );
});

test("the focus is switchable, one option per tracked condition", () => {
  const opts = focusOptions(patient([sjia, diabetes]));
  assert.deepEqual(opts.map((o) => o.id), ["sjia", "diabetes"]);
  assert.equal(defaultFocus(patient([sjia, diabetes])), "sjia", "默认落在 MAS 类");
  /* 切到糖尿病，标题就跟着变 */
  assert.match(focusLabel(patient([sjia, diabetes]), "diabetes"), /糖尿病/);
  /* 切换后预备问题也跟着换 */
  const scoped = questionGroups(patient([sjia, diabetes]), "diabetes");
  assert.deepEqual(scoped.map((g) => g.id), ["diabetes", "general"]);
});

test("the subtitle says one thing and does not repeat the title", () => {
  const h = promptHint();
  assert.match(h, /医疗记录/, "要说明会结合上传的记录");
  assert.doesNotMatch(h, /你关注的是/, "标题下面再说一遍「你关注的是」是废话");
  assert.doesNotMatch(h, /可以这样问/);
});

test("scoped focus never leaks another condition's questions", () => {
  const p = patient([sjia, diabetes]);
  for (const q of questionGroups(p, "diabetes").flatMap((g) => g.questions)) {
    assert.doesNotMatch(q, /失血|HLH|八选/, "切到血糖后不该还看到 MAS 问题");
  }
});

test("privacy note reflects the chosen window", () => {
  assert.match(privacyNote(30), /近 30 天/);
  assert.match(privacyNote(CONTEXT_ALL), /全部/);
  for (const w of [7, 90, CONTEXT_ALL]) {
    const n = privacyNote(w as never);
    assert.match(n, /不会发送/, "必须说明哪些内容不会外发");
    assert.match(n, /姓名/);
  }
});

test("questions are grouped into sessions, not one flat list", () => {
  const gs = questionGroups(patient([sjia]));
  assert.ok(gs.length >= 2, "至少要有病种组和通用组两段");
  assert.match(gs[0].label, /sJIA/, "病种组排在最前");
  assert.equal(gs[gs.length - 1].id, "general", "通用组垫底");
  assert.ok(gs[0].questions.length > 0);
  /* 扁平接口要跟分组结果一致 */
  assert.deepEqual(presetQuestions(patient([sjia])), gs.flatMap((g) => g.questions));
});

test("each tracked condition gets its own session", () => {
  const gs = questionGroups(patient([diabetes, heart]));
  assert.deepEqual(
    gs.map((g) => g.id),
    ["diabetes", "heart", "general"],
  );
});

test("MAS-type sessions come first and never duplicate", () => {
  const mas: Monitor = { id: "m4", name: "MAS", preset: "mas", metrics: [], active: true };
  const gs = questionGroups(patient([diabetes, sjia, mas]));
  assert.deepEqual(
    gs.map((g) => g.id),
    ["sjia", "diabetes", "general"],
    "sjia 与 mas 同属一组，不重复出现",
  );
});

test("the general session is always available", () => {
  for (const monitors of [[], [diabetes], [sjia]]) {
    const gs = questionGroups(patient(monitors));
    const general = gs.find((g) => g.id === "general");
    assert.ok(general, `「${monitors.length} 个监控」时也要有通用组`);
    assert.ok(!general!.questions.some((q) => /失血|HLH/.test(q)), "通用组不夹带病种问题");
  }
});

test("a patient with no monitors still gets a usable session", () => {
  const gs = questionGroups(patient([]));
  assert.equal(gs.length, 1);
  assert.equal(gs[0].id, "general");
});

/* ────────────────────── 智能提问（两段式） ────────────────────── */

function obsTrend(metric: string, from: string, to: string, at: string): Observation {
  return { ...obs(metric, to, at), id: `${metric}-${at}-b` };
}

test("smart questions are premise + question, never advice", () => {
  const p = patient(
    [sjia],
    [obs("ferritin", "500", "2026-10-01T09:00"), obsTrend("ferritin", "500", "900", "2026-10-05T09:00")],
  );
  const qs = smartQuestions({ patient: p, nameOf: () => "铁蛋白", unitOf: () => "ng/mL" });
  assert.ok(qs.length > 0);
  for (const q of qs) {
    assert.ok(q.premise.length > 0, "每条都要有现象");
    assert.ok(q.ask.length > 0, "每条都要有问题");
    assert.match(q.ask, /[？?]$/, `问题要以问号收尾：${q.ask}`);
    /* 小 Q 的红线：不诊断、不给用药或干预时机 */
    assert.doesNotMatch(q.ask, /确诊|诊断为|建议用药|加药|减药|加量|减量|该吃|要不要吃|停药/);
  }
});

test("smart premises quote real numbers, never invented ones", () => {
  const p = patient([sjia], [obs("ferritin", "820", "2026-10-05T09:00")]);
  const qs = smartQuestions({ patient: p, nameOf: () => "铁蛋白", unitOf: () => "ng/mL" });
  assert.ok(!qs.some((q) => /铁蛋白/.test(q.premise)), "只有一次读数时说不了「变化」");
});

test("a flat metric produces no trend question", () => {
  const p = patient(
    [sjia],
    [obs("platelet", "200", "2026-10-01T09:00"), obsTrend("platelet", "200", "201", "2026-10-05T09:00")],
  );
  const qs = smartQuestions({ patient: p, nameOf: () => "血小板", unitOf: () => "" });
  assert.ok(!qs.some((q) => q.id.startsWith("trend-")), "1% 的波动不是趋势");
});

test("smart questions pick up the position the family is actually at", () => {
  const p = patient([sjia], []);
  const qs = smartQuestions({
    patient: p,
    verdicts: [
      {
        standard: "hlh-2004",
        status: "not-meet",
        headline: "8 条里已达标 3 条",
        detail: "",
        criteria: [],
        metCount: 3,
        assessableCount: 5,
      },
    ],
  });
  const hlh = qs.find((q) => q.id === "hlh-gap");
  assert.ok(hlh, "HLH 未达标时要有对应的问题");
  assert.match(hlh!.premise, /3 条/);
  assert.match(hlh!.ask, /医生/, "要指向和医生讨论");
});

test("medication events become a question instead of an assumption", () => {
  const p: Patient = {
    ...patient([sjia]),
    events: [
      { id: "e1", type: "服药", label: "泼尼松 5mg", at: "2026-10-03T08:00" },
      { id: "e2", type: "调药", label: "激素减量", at: "2026-10-06T08:00" },
    ] as CareEvent[],
  };
  const qs = smartQuestions({ patient: p });
  const med = qs.find((q) => q.id === "medication");
  assert.ok(med, "有用药事件就该有一条对应问题");
  assert.match(med!.premise, /2026-10-06/);
});

test("rotating the smart list walks through every candidate and wraps", () => {
  const list = Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, premise: `p${i}`, ask: `a${i}？` }));
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    for (const q of rotateSmart(list, i, 3)) seen.add(q.id);
  }
  assert.equal(seen.size, list.length, "转一圈必须把每条都露出来");
  assert.deepEqual(rotateSmart(list, 0, 3).map((q) => q.id), ["q0", "q1", "q2"]);
  /* 偏移量可以超过长度，不许崩 */
  assert.deepEqual(rotateSmart(list, 8, 3).map((q) => q.id), ["q1", "q2", "q3"]);
  assert.deepEqual(rotateSmart([], 3, 3), []);
});

/* ────────────────────────── 上下文组装 ────────────────────────── */

test("context reports direction from the two most recent values", () => {
  const p = patient(
    [sjia],
    [
      obs("ferritin", "500", "2026-10-01T09:00"),
      obs("ferritin", "800", "2026-10-05T09:00"),
      obs("platelet", "200", "2026-10-01T09:00"),
      obs("platelet", "200", "2026-10-05T09:00"),
    ],
  );
  const ctx = buildContext({ patient: p, alerts: [], today: "2026-10-06" });
  const fer = ctx.observations.find((o) => o.metric === "ferritin")!;
  assert.equal(fer.direction, "up");
  assert.equal(fer.latest, "800");
  assert.equal(fer.previous, "500");
  const plt = ctx.observations.find((o) => o.metric === "platelet")!;
  assert.equal(plt.direction, "flat");
});

test("context carries a single reading without inventing a previous value", () => {
  const p = patient([sjia], [obs("ferritin", "800", "2026-10-05T09:00")]);
  const ctx = buildContext({ patient: p, alerts: [], today: "2026-10-06" });
  const fer = ctx.observations.find((o) => o.metric === "ferritin")!;
  assert.equal(fer.previous, null);
  assert.equal(fer.direction, "flat");
});

test("the day window clips older records", () => {
  const p = patient(
    [sjia],
    [
      obs("ferritin", "100", "2026-06-01T09:00"), // 137 天前：90 天窗口外，7 天窗口也外
      obs("ferritin", "300", "2026-10-04T09:00"), // 2 天前：两个窗口内
      obs("ferritin", "500", "2026-10-05T09:00"),
    ],
  );
  const wide = buildContext({ patient: p, alerts: [], today: "2026-10-06", window: 90 });
  const narrow = buildContext({ patient: p, alerts: [], today: "2026-10-06", window: 7 });
  assert.equal(wide.observations.find((o) => o.metric === "ferritin")!.previous, "300");
  assert.equal(narrow.observations.find((o) => o.metric === "ferritin")!.previous, "300");
  // 更早的一条在两个窗口外，都不参与比较
  assert.doesNotMatch(JSON.stringify(wide.observations), /"100"/);
  assert.doesNotMatch(JSON.stringify(narrow.observations), /"100"/);
});

test("context never carries names or free-text descriptions", () => {
  const p = patient(
    [sjia],
    [
      obs("ferritin", "800", "2026-10-05T09:00"),
      { ...obs("rash", "是", "2026-10-05T10:00"), note: undefined } as Observation,
    ],
  );
  const ctx = buildContext({ patient: p, alerts: [], today: "2026-10-06" });
  const blob = JSON.stringify(ctx);
  assert.doesNotMatch(blob, /小宇/, "患者姓名不能外发");
  assert.doesNotMatch(blob, /自由病情描述/, "自由文本不能外发");
  assert.doesNotMatch(blob, /小宇妈妈/, "录入人不能外发");
});

test("non-numeric observations are left out of the context", () => {
  const p = patient([sjia], [obs("rash", "是", "2026-10-05T10:00")]);
  const ctx = buildContext({ patient: p, alerts: [], today: "2026-10-06" });
  assert.equal(ctx.observations.find((o) => o.metric === "rash"), undefined);
});

test("alerts travel as level and title only, without evidence prose", () => {
  const ctx = buildContext({
    patient: patient([sjia]),
    today: "2026-10-06",
    alerts: [{ level: "red", title: "铁蛋白 1200 ng/mL，越过观察线" }],
  });
  assert.deepEqual(ctx.alerts, [{ level: "red", title: "铁蛋白 1200 ng/mL，越过观察线" }]);
  const blob = JSON.stringify(ctx.alerts);
  assert.doesNotMatch(blob, /建议|依据|就医/, "证据链正文不应外发");
});

test("verdicts travel as status and headline only", () => {
  const ctx = buildContext({
    patient: patient([sjia]),
    today: "2026-10-06",
    verdicts: [
      {
        standard: "hlh-2004",
        status: "not-meet",
        headline: "8 条里已达标 3 条，还差 2 条",
        detail: "很长的解释，不该外发",
        criteria: [],
        metCount: 3,
        assessableCount: 5,
      },
    ],
  });
  assert.deepEqual(ctx.verdicts, [
    { standard: "hlh-2004", status: "not-meet", headline: "8 条里已达标 3 条，还差 2 条" },
  ]);
});

test("the guardrail forbids diagnosis and treatment timing", () => {
  assert.match(ASSISTANT_GUARDRAIL, /不做诊断/);
  assert.match(ASSISTANT_GUARDRAIL, /用药|干预时机/);
  assert.match(ASSISTANT_GUARDRAIL, /医生/);
});

/* ────────────────────────── 对话历史 ────────────────────────── */

function convo(id: string, updatedAt: string): Conversation {
  return {
    id,
    startedAt: updatedAt,
    updatedAt,
    title: id,
    turns: [{ role: "user", text: id }, { role: "assistant", text: "回答" }],
  };
}

test("history keys are isolated per role and per patient", () => {
  assert.equal(historyKey("family", "p1"), "nuanshao:assistant:v1:family:p1");
  assert.notEqual(historyKey("family", "p1"), historyKey("family", "p2"));
  assert.notEqual(historyKey("family", "p1"), historyKey("doctor", "p1"));
});

test("history comes back newest first", () => {
  const list = capConversations([convo("a", "2026-10-01"), convo("c", "2026-10-03"), convo("b", "2026-10-02")]);
  assert.deepEqual(list.map((c) => c.id), ["c", "b", "a"]);
});

test("history is capped at the documented limit", () => {
  const many = Array.from({ length: HISTORY_LIMIT + 8 }, (_, i) =>
    convo(`c${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`),
  );
  assert.equal(capConversations(many).length, HISTORY_LIMIT);
});

test("bad history storage degrades to empty instead of crashing", () => {
  for (const raw of ["", "not json", "{}", "[]", "[1,2]", '[{"id":1}]', "null"]) {
    assert.deepEqual(parseHistory(raw), [], `「${raw}」应被安全忽略`);
  }
});

test("valid history survives a round trip", () => {
  const list = [convo("a", "2026-10-01")];
  assert.equal(parseHistory(JSON.stringify(list)).length, 1);
});

test("a conversation is titled by its first question", () => {
  assert.equal(conversationTitle([{ role: "user", text: "铁蛋白高吗" }, { role: "assistant", text: "…" }]), "铁蛋白高吗");
  assert.equal(
    conversationTitle([{ role: "assistant", text: "先回答" }]),
    "未命名对话",
    "没有提问就不该编出一个标题",
  );
  const long = conversationTitle([{ role: "user", text: "这是一句非常非常长的提问用来测试截断行为" }]);
  assert.ok(long.length <= 25, "长标题要截断");
});