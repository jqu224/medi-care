// 接线层测试：覆盖那些「函数本身是对的、但没接上」的地方。
//
// tiers / assistant / staticScoring 三份单测验证的是纯函数，
// 而浏览器里真正会出问题的是接缝——设置读档、对话历史落盘恢复、
// 判分卡渲染出来的文案。这里补的就是这三段。

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { readPersistedSettings } from "../src/engine/store";
import { DEFAULT_SETTINGS, METRICS, TIERS } from "../src/engine/config";
import {
  HISTORY_LIMIT,
  loadHistory,
  saveHistory,
  type Conversation,
  type HistoryStorage,
  type Turn,
} from "../src/workspace/assistant";
import { ScoringCard } from "../src/workspace/ScoringCard";

/* ══════════════════ 一、预警设置读档边界 ══════════════════
   runEngine 用 `settings.weights[k] > 0` 判断某指标是否启用。
   缺键 → undefined > 0 为 false → 该指标的预警被静默关掉。 */

test("legacy settings persisted before the tier change still load as a real tier", () => {
  const s = readPersistedSettings(JSON.stringify({ sensitivity: 1.3, weights: {}, coreFlags: {} }));
  assert.equal(s.tier, "cautious", "旧版连续灵敏度要被折算成档位，否则界面上三档都不选中");
  assert.ok(TIERS.some((t) => t.id === s.tier));
});

test("a truncated settings object never silently disables a metric", () => {
  /* 只存了两个指标就中断——旧版本崩溃或手工改过存储都可能留下这种数据 */
  const s = readPersistedSettings(JSON.stringify({ tier: "balanced", weights: { temp: 3 } }));
  for (const m of METRICS) {
    const w = s.weights[m.key];
    assert.equal(typeof w, "number", `${m.key} 权重缺失会让它的预警静默失效`);
    assert.ok(w > 0, `${m.key} 权重为 ${w}，runEngine 会认为它没启用`);
  }
  assert.equal(s.coreFlags.ferritin, DEFAULT_SETTINGS.coreFlags.ferritin);
});

test("corrupted or empty settings fall back to defaults rather than throwing", () => {
  for (const raw of [null, "", "not json", "[]", '{"weights":null}', "0"]) {
    const s = readPersistedSettings(raw);
    assert.equal(s.tier, "balanced", `「${raw}」应回落到默认档位`);
    assert.deepEqual(s.weights, DEFAULT_SETTINGS.weights);
    assert.deepEqual(s.coreFlags, DEFAULT_SETTINGS.coreFlags);
  }
});

test("settings read back from their own stored form do not drift", () => {
  const once = readPersistedSettings(JSON.stringify({ sensitivity: 0.6 }));
  const twice = readPersistedSettings(JSON.stringify(once));
  assert.deepEqual(twice, once, "迁移一次就稳定，反复读写不再变化");
});

test("a stored tier survives the round trip", () => {
  for (const t of TIERS) {
    const raw = JSON.stringify({ ...DEFAULT_SETTINGS, tier: t.id });
    assert.equal(readPersistedSettings(raw).tier, t.id, `${t.name} 档存下来再读要还是它自己`);
  }
});

/* ══════════════════ 二、问助手历史写入与恢复 ══════════════════ */

function fakeStorage(): HistoryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

function convo(id: string, updatedAt: string, question = "铁蛋白高吗"): Conversation {
  return {
    id,
    startedAt: updatedAt,
    updatedAt,
    title: question,
    turns: [
      { role: "user", text: question },
      { role: "assistant", text: "我把最近几次的数值列给你，具体判断交给医生。" },
    ] satisfies Turn[],
  };
}

test("a conversation survives write then read back", () => {
  const store = fakeStorage();
  assert.ok(saveHistory(store, "family", "p1", convo("c1", "2026-10-05T10:00")), "写入应当成功");
  const back = loadHistory(store, "family", "p1");
  assert.equal(back.length, 1);
  assert.equal(back[0].id, "c1");
  assert.equal(back[0].turns.length, 2);
  assert.equal(back[0].turns[0].role, "user");
});

test("conversations accumulate newest first", () => {
  const store = fakeStorage();
  saveHistory(store, "family", "p1", convo("c1", "2026-10-01T09:00", "第一问"));
  saveHistory(store, "family", "p1", convo("c2", "2026-10-03T09:00", "第二问"));
  saveHistory(store, "family", "p1", convo("c3", "2026-10-02T09:00", "第三问"));
  assert.deepEqual(
    loadHistory(store, "family", "p1").map((c) => c.id),
    ["c2", "c3", "c1"],
    "最近一次提问要排在最前面",
  );
});

test("the storage layer keeps families and patients apart", () => {
  const store = fakeStorage();
  saveHistory(store, "family", "p1", convo("p1-a", "2026-10-05T09:00", "小宇的问题"));
  saveHistory(store, "family", "p2", convo("p2-a", "2026-10-05T09:00", "小新的问题"));
  saveHistory(store, "doctor", "p1", convo("doc-a", "2026-10-05T09:00", "医生的问题"));
  assert.equal(loadHistory(store, "family", "p1")[0].id, "p1-a");
  assert.equal(loadHistory(store, "family", "p2")[0].id, "p2-a");
  assert.equal(loadHistory(store, "doctor", "p1")[0].id, "doc-a");
});

test("storage enforces the cap instead of growing without bound", () => {
  const store = fakeStorage();
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    saveHistory(store, "family", "p1", convo(`c${i}`, `2026-10-${day}T09:00`));
  }
  assert.equal(loadHistory(store, "family", "p1").length, HISTORY_LIMIT);
});

test("a storage that refuses writes reports failure instead of throwing", () => {
  const blocked: HistoryStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(saveHistory(blocked, "family", "p1", convo("c1", "2026-10-05T09:00")), null);
  assert.deepEqual(loadHistory(blocked, "family", "p1"), [], "写失败后仍要能正常读，不许崩");
});

test("a storage that throws on read degrades to no history", () => {
  const angry: HistoryStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {},
  };
  assert.deepEqual(loadHistory(angry, "family", "p1"), []);
});

/* ══════════════════ 三、判分卡渲染 ══════════════════
   需求方小 Q：「绝大部分孩子……符合其中的三条、符合其中的四条」，
   所以「未采集」必须显式出现，且不能被渲染成「未达标」。 */

const render = (snapshot: Parameters<typeof ScoringCard>[0]["snapshot"]) =>
  renderToStaticMarkup(
    createElement(ScoringCard, { snapshot, basis: "每个指标最近一条" }),
  );

/** 去掉标签，留下家属实际看到的文字 */
const textOf = (html: string) => html.replace(/<[^>]+>/g, "");

/** 把每个胶囊归属到它的状态组。返回 map：state → label 列表 */
function pillsByState(html: string): Map<string, string[]> {
  const re = /class="scoring-pill (is-[\w-]+)"[\s\S]*?<span class="scoring-pill-label">([^<]+)<\/span>/g;
  const out = new Map<string, string[]>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const state = m[1].replace("is-", "");
    const label = m[2];
    out.set(state, [...(out.get(state) ?? []), label]);
  }
  return out;
}

const snapshotWithGaps = {
  ferritin: 820,
  platelet: 150,
  ast: 62,
  tg: 210,
  fibrinogen: 2.1,
  ldh: 480,
  flags: {
    feverToday: 39.2,
    feverStreakHigh: 4,
    cytopeniaLines: 2,
    splenomegaly: true,
    bleeding: false,
    arthritis: true,
    cns: false,
  },
};

test("the card gives a one-line position per standard, not 21 detail rows", () => {
  const html = render(snapshotWithGaps);
  assert.equal(
    (html.match(/<li class="scoring-summary /g) ?? []).length,
    3,
    "三套标准各一行汇总",
  );
  assert.ok(html.includes("本次检验评估"));
  /* 用缩写因为字数有限；细节藏在展开区 */
  const text = textOf(html);
  assert.match(text, /HLH-2004/);
  assert.match(text, /PRINTO/);
  assert.match(text, /MS 评分/);
});

test("criteria are grouped by state, not by standard", () => {
  const html = render(snapshotWithGaps);
  assert.equal(
    (html.match(/class="scoring-group (is-[\w-]+)"/g) ?? []).length,
    3,
    "三个状态组",
  );
  assert.ok((html.match(/class="scoring-pill /g) ?? []).length > 5, "胶囊数量应该很多");
});

test("the order is 未采集 first so the family sees what's missing before what's wrong", () => {
  const html = render(snapshotWithGaps);
  const order = [...html.matchAll(/class="scoring-group (is-[\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["is-not-measured", "is-not-met", "is-met"]);
});

test("uncollectable items sit in 未采集, never in 未达标 or 已达标", () => {
  const html = render(snapshotWithGaps);
  const byState = pillsByState(html);
  const uncollectable = ["NK 细胞活性降低", "sCD25 升高", "骨髓/肝脾/淋巴结噬血现象"];
  const notMeasured = byState.get("not-measured") ?? [];
  for (const label of uncollectable) {
    assert.ok(notMeasured.includes(label), `「${label}」应当在 未采集 组`);
    assert.ok(
      !(byState.get("not-met") ?? []).includes(label),
      `「${label}」不能被算成 未达标`,
    );
    assert.ok(
      !(byState.get("met") ?? []).includes(label),
      `「${label}」不能被算成 已达标`,
    );
  }
});

test("the card keeps the no-diagnosis boundary in the footer", () => {
  const text = textOf(render(snapshotWithGaps));
  assert.match(text, /不等于诊断/);
  assert.match(text, /请由医生判断/);
});

test("the gap note keeps 未采集 ≠ 未达标 in plain language", () => {
  const html = render(snapshotWithGaps);
  assert.match(html, /scoring-gaps/);
  assert.match(textOf(html), /不等于/, "「不等于没事」必须出现");
});

test("the per-criterion detail is collapsed by default with a real toggle", () => {
  const html = render(snapshotWithGaps);
  assert.ok(html.includes("scoring-detail-toggle"));
  assert.ok(html.includes("展开每项的具体数值与判断口径"));
  /* <details> 没带 open 属性——默认折叠 */
  assert.ok(!/<details class="scoring-detail-toggle" open/.test(html));
});

test("MS met criteria are filtered out of the state pills (they aren't diagnostic yes/no)", () => {
  /* 给 MS 一个完整 snapshot，确保 MS 的「系数项」不会污染已达标胶囊 */
  const full: Parameters<typeof ScoringCard>[0]["snapshot"] = {
    ferritin: 800,
    platelet: 150,
    ast: 60,
    tg: 200,
    fibrinogen: 1.8,
    ldh: 500,
    flags: {
      feverToday: 39,
      feverStreakHigh: 5,
      cytopeniaLines: 2,
      cns: false,
      bleeding: true,
      arthritis: false,
      splenomegaly: false,
      hemophagocytosis: true,
    },
  };
  const byState = pillsByState(render(full));
  /* MS 的「血小板计数（系数 −0.003）」不该出现在已达标胶囊里——
     它只是公式输入，不是诊断意义上的达标 */
  const metLabels = byState.get("met") ?? [];
  assert.ok(!metLabels.some((l) => l.includes("系数")), "MS 系数项不应进入状态胶囊");
  assert.ok((byState.get("met") ?? []).length > 0, "HLH/PRINTO 的达标项还要正常显示");
});

test("a child below the HLH threshold is shown a position, not a verdict", () => {
  /* 对应小 Q 说的「符合其中的三条」那种典型情况 */
  const text = textOf(
    render({
      ferritin: 300,
      platelet: 260,
      flags: { feverToday: 38.8, feverStreakHigh: 3, cytopeniaLines: 1 },
    }),
  );
  assert.match(text, /8 条里已达标 \d+ 条/, "要给出可讨论的位置");
  assert.doesNotMatch(text, /确诊|诊断为|建议用药|加量|减量|需要用激素/);
});
