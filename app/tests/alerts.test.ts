import assert from "node:assert/strict";
import { test } from "node:test";
import { runEngine } from "../src/engine/alerts";
import { DEFAULT_SETTINGS } from "../src/engine/config";
import { engineEvents } from "../src/workspace/model";
import type { SeedData } from "../src/data/seed";
import type { CareEvent } from "../src/workspace/model";

/* ----------------------------- 事件映射 R7 ------------------------------ */

function ev(p: Partial<CareEvent>): CareEvent {
  return {
    id: "e1",
    type: "服药",
    at: "2026-10-01T09:00",
    created: "2026-10-01T09:00",
    author: "小宇妈妈",
    drug: "",
    dose: "",
    unit: "",
    route: "",
    hospital: "",
    institution: "",
    note: "",
    monitors: [],
    ...p,
  };
}

test("steroid dose changes map to the engine steroid type", () => {
  const out = engineEvents([
    ev({ type: "调药", drug: "甲泼尼龙", dose: "8→4", unit: "mg" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "steroid");
  assert.match(out[0].label, /甲泼尼龙|调药/);
});

test("non-steroid medication changes do not open the taper window", () => {
  const out = engineEvents([
    ev({ type: "调药", drug: "托珠单抗", dose: "1", unit: "支" }),
    ev({ type: "服药", drug: "美西律" }),
    ev({ type: "打针", drug: "生长激素" }),
  ]);
  assert.deepEqual(out, [], "无法判定为激素的事件一律不映射，宁可漏提醒也不误报");
});

test("hospital and follow-up events keep their meaning", () => {
  const out = engineEvents([
    ev({ type: "住院", at: "2026-10-02T10:00", hospital: "某儿童医院" }),
    ev({ type: "复诊", at: "2026-10-05T09:00" }),
  ]);
  assert.deepEqual(
    out.map((e) => e.type),
    ["hospital", "visit"],
  );
});

test("steroid hints tolerate other formulations", () => {
  for (const drug of ["醋酸泼尼松", "地塞米松", "氢化可的松", "曲安奈德", "倍他米松"]) {
    const out = engineEvents([ev({ type: "调药", drug })]);
    assert.equal(out[0]?.type, "steroid", `${drug} 应识别为激素`);
  }
});

test("mapped events come back in date order", () => {
  const out = engineEvents([
    ev({ type: "调药", drug: "甲泼尼龙", at: "2026-10-08T09:00" }),
    ev({ type: "调药", drug: "地塞米松", at: "2026-10-01T09:00" }),
  ]);
  assert.deepEqual(
    out.map((e) => e.date),
    ["2026-10-01", "2026-10-08"],
  );
});

/* ------------------------------ R7 触发 -------------------------------- */

function dataWith(opts: {
  events?: SeedData["events"];
  lastTemp?: number;
  lastDate?: string;
}): SeedData {
  const date = opts.lastDate ?? "2026-10-08";
  return {
    series: {
      temp: [{ date, value: opts.lastTemp ?? 38.5, source: "手录" }],
      ferritin: [],
      platelet: [],
      fibrinogen: [],
      ast: [],
      tg: [],
      ldh: [],
    },
    logs: [
      { date, temps: [opts.lastTemp ?? 38.5], symptoms: [], steroidMg: 0, bio: false, medDone: false },
    ],
    events: opts.events ?? [],
  };
}

test("taper alert fires when a steroid reduction sits inside the 14 day window", () => {
  const alerts = runEngine({
    data: dataWith({
      events: [{ date: "2026-10-02", type: "steroid", label: "减量 8 → 4mg" }],
    }),
    settings: DEFAULT_SETTINGS,
  });
  const taper = alerts.find((a) => a.id === "taper");
  assert.ok(taper, "R7 应该触发——此前工作台从未传事件，这条规则一直是死代码");
  assert.equal(taper!.level, "watch");
  assert.match(taper!.title, /减量/);
});

test("taper alert does not fire without a steroid event", () => {
  const alerts = runEngine({
    data: dataWith({
      events: [{ date: "2026-10-02", type: "hospital", label: "住院" }],
    }),
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(alerts.find((a) => a.id === "taper"), undefined);
});

test("taper alert stops after the 14 day window closes", () => {
  const alerts = runEngine({
    data: dataWith({
      events: [{ date: "2026-08-01", type: "steroid", label: "减量" }],
      lastDate: "2026-10-08",
    }),
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(alerts.find((a) => a.id === "taper"), undefined);
});

test("taper alert needs an actual fever inside the window", () => {
  const alerts = runEngine({
    data: dataWith({
      events: [{ date: "2026-10-02", type: "steroid", label: "减量" }],
      lastTemp: 37.2,
    }),
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(alerts.find((a) => a.id === "taper"), undefined);
});

/* ------------------------------ R8 触发 -------------------------------- */

test("falling inflammation markers during fever raise the watch", () => {
  const alerts = runEngine({
    data: dataWith({ lastTemp: 39.1 }),
    settings: DEFAULT_SETTINGS,
    inflammation: [
      { date: "2026-10-05", value: 180, metricName: "白细胞" },
      { date: "2026-10-08", value: 100, metricName: "白细胞" },
    ],
  });
  const r8 = alerts.find((a) => a.id === "reassure");
  assert.ok(r8, "持续发热 + 白细胞下降 44% 应该触发");
  assert.equal(r8!.level, "watch", "这是提示别误读回落，不判定是否合并 MAS");
  assert.match(r8!.title, /白细胞/);
  assert.match(r8!.evidence.line, /回落不等于好转/);
});

test("R8 stays silent when the child is not febrile", () => {
  const alerts = runEngine({
    data: dataWith({ lastTemp: 37.1 }),
    settings: DEFAULT_SETTINGS,
    inflammation: [
      { date: "2026-10-05", value: 180, metricName: "CRP" },
      { date: "2026-10-08", value: 90, metricName: "CRP" },
    ],
  });
  assert.equal(alerts.find((a) => a.id === "reassure"), undefined);
});

test("R8 stays silent when the marker rose instead", () => {
  const alerts = runEngine({
    data: dataWith({ lastTemp: 39.0 }),
    settings: DEFAULT_SETTINGS,
    inflammation: [
      { date: "2026-10-05", value: 40, metricName: "血沉" },
      { date: "2026-10-08", value: 90, metricName: "血沉" },
    ],
  });
  assert.equal(alerts.find((a) => a.id === "reassure"), undefined);
});

test("R8 stays silent for a drop smaller than the threshold", () => {
  const alerts = runEngine({
    data: dataWith({ lastTemp: 39.0 }),
    settings: DEFAULT_SETTINGS,
    inflammation: [
      { date: "2026-10-05", value: 100, metricName: "白细胞" },
      { date: "2026-10-08", value: 85, metricName: "白细胞" },
    ],
  });
  assert.equal(alerts.find((a) => a.id === "reassure"), undefined, "15% 回落不触发");
});

test("R8 is silent when a marker only has one reading", () => {
  const alerts = runEngine({
    data: dataWith({ lastTemp: 39.0 }),
    settings: DEFAULT_SETTINGS,
    inflammation: [{ date: "2026-10-08", value: 100, metricName: "白细胞" }],
  });
  assert.equal(alerts.find((a) => a.id === "reassure"), undefined);
});

test("R8 handles a missing inflammation series without throwing", () => {
  const alerts = runEngine({ data: dataWith({ lastTemp: 39.0 }), settings: DEFAULT_SETTINGS });
  assert.ok(Array.isArray(alerts));
});

test("R8 never claims the condition is safe", () => {
  const alerts = runEngine({
    data: dataWith({ lastTemp: 39.1 }),
    settings: DEFAULT_SETTINGS,
    inflammation: [
      { date: "2026-10-05", value: 180, metricName: "白细胞" },
      { date: "2026-10-08", value: 60, metricName: "白细胞" },
    ],
  });
  const r8 = alerts.find((a) => a.id === "reassure")!;
  const text = `${r8.title}${r8.summary}${r8.evidence.what}${r8.evidence.line}${r8.evidence.action}`;
  assert.doesNotMatch(text, /安全|已排除|没有风险/);
});