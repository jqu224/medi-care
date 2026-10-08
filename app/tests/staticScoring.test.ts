import assert from "node:assert/strict";
import { test } from "node:test";
import {
  scoreHlh2004,
  scoreMsTable,
  scorePrinto2016,
  scoreStatic,
  groupCriteriaByState,
  STANDARD_SHORT_NAMES,
  scoreStatic,
  type Snapshot,
} from "../src/engine/staticScoring";

/** 满分快照：PRINTO 全满足、HLH 可评估项全满足、MS 项齐全 */
const full: Snapshot = {
  ferritin: 1200,
  platelet: 90,
  ast: 90,
  tg: 300,
  tgMmol: 4.2,
  fibrinogen: 2.1,
  ldh: 400,
  flags: {
    feverToday: 39.2,
    feverStreakHigh: 9,
    cns: false,
    bleeding: false,
    arthritis: false,
    cytopeniaLines: 3,
  },
};

/* ------------------------------ 2016 PRINTO ------------------------------ */

test("printo meets with fever, ferritin over 684 and two more criteria", () => {
  const v = scorePrinto2016(full);
  assert.equal(v.status, "meet");
  assert.equal(v.criteria[0].state, "met", "发热前提");
  assert.equal(v.criteria[1].state, "met", "铁蛋白必备");
  assert.equal(v.metCount, 4);
});

test("printo does not meet with only one companion criterion", () => {
  const v = scorePrinto2016({ ...full, ast: 30, tg: 100, fibrinogen: 5 });
  assert.equal(v.status, "not-meet");
  assert.equal(v.metCount, 1);
  assert.match(v.headline, /还差 1 项/);
});

test("printo needs fever: ferritin high without fever does not meet", () => {
  const v = scorePrinto2016({ ...full, flags: { ...full.flags, feverToday: 37.2 } });
  assert.equal(v.status, "not-meet");
  assert.match(v.headline, /发热前提/);
});

test("printo needs ferritin over 684 as a prerequisite", () => {
  const v = scorePrinto2016({ ...full, ferritin: 400 });
  assert.equal(v.status, "not-meet");
  assert.match(v.headline, /铁蛋白/);
});

test("printo reports insufficient when ferritin is not measured", () => {
  const v = scorePrinto2016({ ...full, ferritin: undefined });
  assert.equal(v.status, "insufficient");
  assert.match(v.headline, /还缺/);
});

test("printo treats unmeasured companions as unmeasured, never as normal", () => {
  const v = scorePrinto2016({ ...full, ast: undefined, tg: undefined, fibrinogen: undefined });
  const unmeasured = v.criteria.filter((c) => c.state === "not-measured");
  assert.equal(unmeasured.length, 3);
  // assessableCount 语义：仅统计 4 项「伴随项」的可评估数，不含发热前提与铁蛋白必备项
  assert.equal(v.assessableCount, 1, "4 项伴随项里只有血小板可评估");
  assert.match(v.headline, /还有 3 项没查/);
});

test("printo thresholds ignore any sensitivity scaling", () => {
  // 684 是指南原值：静态判分不做任何缩放，683 与 685 分属两侧
  const just = scorePrinto2016({ ...full, ferritin: 683 });
  const over = scorePrinto2016({ ...full, ferritin: 685 });
  assert.equal(just.criteria[1].state, "not-met");
  assert.equal(over.criteria[1].state, "met");
});

test("printo direction: platelet low and fibrinogen low both count as met", () => {
  // 血小板与纤维蛋白原都是「低于」才算达标，与 AST/TG 的「高于」方向相反
  const v = scorePrinto2016({ ...full, platelet: 90, fibrinogen: 2.1, ast: 30, tg: 100 });
  const plt = v.criteria.find((c) => c.key === "platelet")!;
  const fbg = v.criteria.find((c) => c.key === "fibrinogen")!;
  assert.equal(plt.state, "met", "血小板 90 < 181");
  assert.equal(fbg.state, "met", "纤维蛋白原 2.1 < 3.6");
  assert.equal(v.status, "meet", "铁蛋白 >684 + 两项达标");
});

/* -------------------------------- HLH-2004 ------------------------------- */

test("hlh meets at five criteria", () => {
  // 可采集且达标的：发热 9 天、血细胞 3 系、铁蛋白 1200 = 3 项；
  // 谷油酯 4.2 mmol/L 达标则第 4 项（tgFbg）。要凑到 5 需补三项无法采集的检查。
  const v = scoreHlh2004(full);
  assert.equal(v.metCount, 4, "发热 + 血细胞 3 系 + 铁蛋白 + 甘油三酯");
  assert.equal(v.status, "not-meet");

  const v2 = scoreHlh2004({
    ...full,
    flags: { ...full.flags, nkActivityLow: true, sCD25High: true, hemophagocytosis: true },
  });
  assert.equal(v2.metCount, 7, "补上 NK、sCD25、噬血现象三项");
  assert.equal(v2.status, "meet");
  assert.match(v2.headline, /达到 5 条标准/);
});

test("hlh does not meet at four criteria", () => {
  const v = scoreHlh2004(full);
  assert.equal(v.status, "not-meet");
  assert.match(v.headline, /还差 1 条/);
});

test("hlh marks uncollectable criteria as not-measured, never not-met", () => {
  const v = scoreHlh2004(full);
  const keys = v.criteria.map((c) => c.key);
  for (const k of ["nk", "sCD25", "hemophagocytosis", "spleen"]) {
    const c = v.criteria.find((x) => x.key === k)!;
    assert.ok(keys.includes(k));
    assert.notEqual(c.state, "not-met", `${k} 未采集不能算未达标`);
  }
  assert.equal(v.assessableCount, 4);
  assert.match(v.detail, /没有录入通道|无法采集/);
});

test("hlh keeps mmol/L and mg/dL apart for triglycerides", () => {
  // 300 mg/dL ≈ 3.3 mmol/L，超过 HLH 的 3 mmol/L 线。
  // 只给 mg/dL、且纤维蛋白原也未达标时，这项应判未达标（单位口径不同，不能换算后直接判达标）。
  const withMmol = scoreHlh2004({ ...full, tgMmol: 4.2, fibrinogen: 5 });
  const withoutMmol = scoreHlh2004({ ...full, tgMmol: undefined, fibrinogen: 5 });
  const a = withMmol.criteria.find((c) => c.key === "tgFbg")!;
  const b = withoutMmol.criteria.find((c) => c.key === "tgFbg")!;
  assert.equal(a.state, "met", "甘油三酯 4.2 mmol/L > 3");
  assert.equal(b.state, "not-met", "缺少 mmol/L 口径结果，不能用 mg/dL 顶替");
  assert.match(b.detail, /mmol\/L 口径/);

  const lowOnly = scoreHlh2004({ ...full, tgMmol: undefined, fibrinogen: 1.2 });
  const c = lowOnly.criteria.find((x) => x.key === "tgFbg")!;
  assert.equal(c.state, "met", "纤维蛋白原 1.2 g/L < 1.5 即达标");
  assert.match(c.detail, /纤维蛋白原/);
});

test("hlh fever needs a seven day streak above 38.5", () => {
  const short = scoreHlh2004({ ...full, flags: { ...full.flags, feverStreakHigh: 4 } });
  const long = scoreHlh2004({ ...full, flags: { ...full.flags, feverStreakHigh: 8 } });
  assert.equal(short.criteria.find((c) => c.key === "fever")!.state, "not-met");
  assert.equal(long.criteria.find((c) => c.key === "fever")!.state, "met");
});

test("hlh cytopenia needs two or more lines", () => {
  const one = scoreHlh2004({ ...full, flags: { ...full.flags, cytopeniaLines: 1 } });
  const two = scoreHlh2004({ ...full, flags: { ...full.flags, cytopeniaLines: 2 } });
  assert.equal(one.criteria.find((c) => c.key === "cytopenia")!.state, "not-met");
  assert.equal(two.criteria.find((c) => c.key === "cytopenia")!.state, "met");
});

test("hlh ferritin uses its own 500 threshold, not the 684 line", () => {
  const mid = scoreHlh2004({ ...full, ferritin: 550 });
  assert.equal(mid.criteria.find((c) => c.key === "ferritin")!.state, "met");
  const low = scoreHlh2004({ ...full, ferritin: 400 });
  assert.equal(low.criteria.find((c) => c.key === "ferritin")!.state, "not-met");
});

test("hlh progress text never claims safety", () => {
  const v = scoreHlh2004(full);
  const all = v.headline + v.detail + v.criteria.map((c) => c.detail).join("");
  assert.doesNotMatch(all, /安全/);
  assert.doesNotMatch(all, /没有风险|已排除/);
});

/* -------------------------------- MS 评分 -------------------------------- */

test("ms gives no conclusion when a required item is missing", () => {
  const v = scoreMsTable({ ...full, ldh: undefined });
  assert.equal(v.status, "insufficient");
  assert.equal(v.score, undefined);
  assert.match(v.headline, /还缺 1 项/);
  assert.match(v.detail, /LDH/);
});

test("ms missing items do not leak a directional conclusion", () => {
  const v = scoreMsTable({ ...full, ldh: undefined, fibrinogen: undefined });
  assert.equal(v.status, "insufficient");
  assert.doesNotMatch(v.headline, /可能性大|可能性小/);
});

test("ms at the -2.1 boundary counts as meeting", () => {
  // 构造恰好等于 −2.1：CNS(2.44) + 出血(1.54) = 3.98；PLT 200×−0.003=−0.6；
  // LDH 100×0.001=0.1；Fbg 5×−0.004=−0.02；SF 1450×0.0001=0.145 → 3.605，偏正。
  // 用关节炎抵消：CNS 2.44 + PLT100×−0.003=−0.3 + LDH0 + Fbg0 + SF0 = 2.14 …
  // 直接构造简单解：PLT 700(−2.1) + Fbg 0 + LDH 0 + SF 0 = −2.1
  const v = scoreMsTable({
    platelet: 700,
    ldh: 0,
    fibrinogen: 0,
    ferritin: 0,
    flags: { cns: false, bleeding: false, arthritis: false },
  });
  assert.equal(v.score, -2.1);
  assert.equal(v.status, "meet", "≥ −2.1 即判可能性大");
  assert.match(v.headline, /已达到/);
});

test("ms just below the boundary does not meet", () => {
  const v = scoreMsTable({
    platelet: 800,
    ldh: 0,
    fibrinogen: 0,
    ferritin: 0,
    flags: { cns: false, bleeding: false, arthritis: false },
  });
  assert.equal(v.score, -2.4);
  assert.equal(v.status, "not-meet");
  assert.match(v.headline, /还差 0\.3/);
});

test("ms keeps fever out of the formula and says so", () => {
  const v = scoreMsTable(full);
  assert.match(v.detail, /发热不计入/);
  assert.ok(!v.criteria.some((c) => c.key === "fever"));
});

/* -------------------------------- 聚合 ---------------------------------- */

test("scoreStatic returns all three standards in a fixed order", () => {
  const all = scoreStatic(full);
  assert.deepEqual(
    all.map((v) => v.standard),
    ["printo-2016", "hlh-2004", "ms-score"],
  );
});

test("every verdict speaks plain language without guideline acronyms", () => {
  for (const v of scoreStatic(full)) {
    const text = `${v.headline}${v.detail}`;
    assert.doesNotMatch(text, /PRINTO|ACR|EULAR|HLH|MAS\b/, `${v.standard} 出现了缩写`);
  }
});

test("an empty snapshot never reports a clean bill of health", () => {
  const all = scoreStatic({});
  for (const v of all) {
    const text = `${v.headline}${v.detail}`;
    assert.doesNotMatch(text, /正常|安全|无风险|已排除/);
    const unmeasured = v.criteria.filter((c) => c.state === "not-measured").length;
    assert.ok(unmeasured > 0, `${v.standard} 空数据应全部为未测`);
  }
});

test("printo and hlh keep separate ferritin lines", () => {
  // 600：PRINTO 未达标(>684)，HLH 达标(>500)
  const snap = { ...full, ferritin: 600 };
  assert.equal(scorePrinto2016(snap).criteria[1].state, "not-met");
  assert.equal(scoreHlh2004(snap).criteria.find((c) => c.key === "ferritin")!.state, "met");
});
test("groupCriteriaByState flattens all three standards into three buckets", () => {
  const gs = groupCriteriaByState(scoreStatic(full));
  /* HLH 8 + PRINTO 6 + MS 7 = 21 总数；MS 只有 not-measured 进来 */
  const total = gs.met.length + gs.notMet.length + gs.notMeasured.length;
  assert.ok(total < 21, "MS 系数项要被过滤掉一部分");
  assert.ok(total >= 8 + 6, "HLH 8 + PRINTO 6 至少要进来");
  assert.ok(gs.notMeasured.length >= 3, "NK/sCD25/噬血是 not-measured");
});

test("MS met criteria do not leak into the met bucket", () => {
  /* 给 MS 全部输入，met 桶里只该有 HLH/PRINTO 的真达标项 */
  const gs = groupCriteriaByState(scoreStatic(full));
  for (const { criterion } of gs.met) {
    assert.ok(!criterion.label.includes("系数"), `MS 系数项 ${criterion.label} 不应在 met 桶`);
  }
});

test("every standard has a short Chinese label for the UI", () => {
  for (const [id, name] of Object.entries(STANDARD_SHORT_NAMES)) {
    assert.ok(typeof name === "string" && name.length > 0, `${id} 缺中文标签`);
  }
});
