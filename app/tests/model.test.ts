import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actorFor,
  allowedPatients,
  alertsFor,
  bucketEnd,
  bucketKey,
  commit,
  isTrendRange,
  KEY,
  loadDatabase,
  mutatePatient,
  periodRange,
  seedDatabase,
  seriesFor,
  assessmentBasis,
  togglePlan,
  trendFull,
  trendRange,
  trendTick,
} from "../src/workspace/model";
import { todayISO, addDaysISO } from "../src/lib/date";
function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
test("roles scope reads and block every doctor write", () => {
  const db = seedDatabase();
  assert.equal(allowedPatients(db, actorFor("patient")).length, 1);
  assert.equal(allowedPatients(db, actorFor("family")).length, 3);
  assert.throws(() =>
    mutatePatient(db, actorFor("doctor"), "p1", (p) => (p.events = [])),
  );
  assert.throws(() =>
    mutatePatient(db, actorFor("patient"), "p2", (p) => (p.events = [])),
  );
});
test("patient mutations cannot alter another patient", () => {
  const db = seedDatabase();
  const next = mutatePatient(
    db,
    actorFor("family"),
    "p1",
    (p) => (p.monitors = []),
  );
  assert.deepEqual(next.patients[1], db.patients[1]);
  assert.equal(db.patients[0].monitors.length, 2);
});
test("daily observations append, shared metrics remain single source", () => {
  const db = seedDatabase();
  const p = db.patients[0];
  const row = {
    ...p.observations[0],
    at: todayISO() + "T09:00",
    value: "38",
    id: "one",
  };
  p.observations.push(row, {
    ...row,
    id: "two",
    at: todayISO() + "T18:00",
    value: "39",
  });
  // 单日窗口保留这一天的每条原始记录，画出一日内的变化。
  assert.equal(seriesFor(p, "temp", todayISO(), todayISO(), "日").rows.length, 2);
  // 跨天窗口一天一个点，体温取当天最高（这里同一天两条，取 39）。
  const span = seriesFor(p, "temp", addDaysISO(todayISO(), -1), todayISO(), "周");
  assert.equal(span.grain, "日");
  assert.equal(span.rows[0].value, "39");
  assert.equal(p.observations.filter((o) => o.at.startsWith(todayISO())).length, 2);
  assert.ok(p.monitors.every((m) => m.metrics.includes("temp")));
});
test("date periods handle year boundary and leap February", () => {
  assert.deepEqual(periodRange("2026-01-01", "周"), [
    "2025-12-29",
    "2026-01-04",
  ]);
  assert.deepEqual(periodRange("2024-02-20", "月"), [
    "2024-02-01",
    "2024-02-29",
  ]);
});
test("trend windows anchor calendar weeks and roll the longer ranges up to today", () => {
  assert.deepEqual(trendRange("本周", "2026-10-08"), ["2026-10-05", "2026-10-08"]);
  assert.deepEqual(trendRange("本周", "2026-10-05"), ["2026-10-05", "2026-10-05"]);
  assert.deepEqual(trendRange("本周", "2027-01-01"), ["2026-12-28", "2027-01-01"]);
  assert.deepEqual(trendRange("本月", "2026-10-08"), ["2026-10-01", "2026-10-08"]);
  assert.deepEqual(trendRange("近 90 天", "2026-10-08"), ["2026-07-11", "2026-10-08"]);
  assert.deepEqual(trendRange("近 180 天", "2026-10-08"), ["2026-04-12", "2026-10-08"]);
  assert.deepEqual(trendRange("近 365 天", "2026-10-08"), ["2025-10-09", "2026-10-08"]);
  assert.deepEqual(trendRange("全部", "2026-10-08", "2025-03-04"), ["2025-03-04", "2026-10-08"]);
  assert.deepEqual(trendRange("全部", "2026-10-08"), ["2026-10-08", "2026-10-08"]);
  assert.deepEqual(trendRange("全部", "2026-10-08", "2027-01-01"), ["2026-10-08", "2026-10-08"]);
  assert.equal(isTrendRange("近 365 天"), true);
  assert.equal(isTrendRange("近 1 年"), false);
});
test("week and month grains keep one point per period, choosing the right value", () => {
  const p = seedDatabase().patients[0];
  const base = p.observations[0];
  const rows = [
    { ...base, id: "a", metric: "temp", value: "37.2", at: "2026-10-05T08:00" },
    { ...base, id: "b", metric: "temp", value: "39.1", at: "2026-10-07T20:00" },
    { ...base, id: "c", metric: "temp", value: "36.6", at: "2026-10-08T08:00" },
    { ...base, id: "d", metric: "temp", value: "38.4", at: "2026-10-12T08:00" },
  ];
  p.observations = rows;
  const weekly = seriesFor(p, "temp", "2026-10-01", "2026-10-31", "周");
  assert.equal(weekly.grain, "周");
  assert.deepEqual(weekly.rows.map((o) => o.id), ["b", "d"]);
  assert.equal(bucketKey("2026-10-11T09:00", "周"), "2026-10-05");
  assert.equal(bucketKey("2026-10-11T09:00", "月"), "2026-10");
  assert.equal(bucketEnd("2026-10", "月"), "2026-10-31");
  p.observations = [
    { ...base, id: "w1", metric: "weight", value: "23.0", at: "2026-10-05T08:00" },
    { ...base, id: "w2", metric: "weight", value: "23.6", at: "2026-10-07T08:00" },
  ];
  // 两天都在 10 月同一周里：月粒度只剩一个点，自动细化到日，两条都保留。
  const both = seriesFor(p, "weight", "2026-10-01", "2026-10-31", "月");
  assert.equal(both.grain, "日");
  assert.deepEqual(both.rows.map((o) => o.id), ["w1", "w2"]);
  // 同一天多次体重只留最后一次，体温则留最高。
  p.observations.push({
    ...base,
    id: "w3",
    metric: "weight",
    value: "23.8",
    at: "2026-10-07T20:00",
  });
  const daily = seriesFor(p, "weight", "2026-10-01", "2026-10-31", "日");
  assert.deepEqual(daily.rows.map((o) => o.id), ["w1", "w3"]);
  assert.equal(trendTick("2026-10-07T20:00", "日", 7), "10-07");
  assert.equal(trendTick("2026-10-07T20:00", "日", 800), "26-10-07");
  assert.equal(trendTick("2026-10-07T20:00", "周", 30), "10-05");
  assert.equal(trendTick("2026-10-07T20:00", "周", 800), "26-10-05");
  assert.equal(trendTick("2026-10-07T20:00", "月", 365), "2026-10");
  assert.equal(trendFull("2026-10-07T20:00", "周"), "10-05 至 10-11（周）");
  assert.equal(trendFull("2026-10-07T20:00", "月"), "2026年10月");
  // 单日窗口给时刻，多日窗口给日期。
  assert.equal(trendFull("2026-10-07T20:30", "日", 1), "20:30");
  assert.equal(trendTick("2026-10-07T20:30", "日", 1), "20:30");
  assert.equal(trendFull("2026-10-07T20:30", "日", 30), "2026-10-07 20:30");
});
test("a window too short for the chosen grain falls back until a trend is drawable", () => {
  const p = seedDatabase().patients[0];
  const base = p.observations[0];
  p.observations = [
    { ...base, id: "m1", metric: "weight", value: "23.0", at: "2026-10-05T08:00" },
    { ...base, id: "m2", metric: "weight", value: "23.4", at: "2026-10-06T08:00" },
  ];
  // 同一周两个点：月粒度只剩一个周期，一路细化到日。
  const sameWeek = seriesFor(p, "weight", "2026-10-05", "2026-10-08", "月");
  assert.equal(sameWeek.grain, "日");
  assert.deepEqual(sameWeek.rows.map((o) => o.id), ["m1", "m2"]);
  // 跨两周只落一个月的窗口：月粒度只掉一级到周。
  p.observations.push({ ...base, id: "m3", metric: "weight", value: "23.9", at: "2026-10-14T08:00" });
  const twoWeeks = seriesFor(p, "weight", "2026-10-05", "2026-10-20", "月");
  assert.equal(twoWeeks.grain, "周");
  assert.deepEqual(twoWeeks.rows.map((o) => o.id), ["m2", "m3"]);
  // 跨两个月的窗口保留用户选的月粒度。
  p.observations.push({ ...base, id: "m4", metric: "weight", value: "24.2", at: "2026-08-03T08:00" });
  const monthly = seriesFor(p, "weight", "2026-08-01", "2026-10-31", "月");
  assert.equal(monthly.grain, "月");
  assert.deepEqual(monthly.rows.map((o) => o.id), ["m4", "m3"]);
  // 没有任何记录时保持为空，不编造趋势。
  assert.equal(seriesFor(p, "weight", "2026-11-01", "2026-11-30", "月").rows.length, 0);
});
test("glucose contexts and empty periods do not fabricate data", () => {
  const p = seedDatabase().patients[1];
  assert.equal(
    seriesFor(p, "glucose", "2020-01-01", "2020-01-31", "月").rows.length,
    0,
  );
  assert.equal(
    seriesFor(p, "glucose", "2020-01-01", "2030-01-01", "月", "餐后").rows.length,
    0,
  );
});
test("legacy migration backs up once, preserves multiple temperatures and unknown time", () => {
  const s = memory();
  s.setItem(
    "sjia:user-logs:v1",
    JSON.stringify([
      {
        date: "2026-01-02",
        temps: [37, 38],
        symptoms: ["rash"],
        medDone: true,
        steroidMg: 5,
      },
    ]),
  );
  const a = loadDatabase(s);
  assert.ok(s.getItem("nuanshao:legacy-backup"));
  assert.equal(
    a.patients[0].observations.filter(
      (o) => o.at === "2026-01-02" && o.metric === "temp",
    ).length,
    2,
  );
  assert.deepEqual(loadDatabase(s), a);
  assert.ok(s.getItem(KEY));
});
test("persistence failures propagate and never replace in-memory data", () => {
  const db = seedDatabase();
  const before = JSON.stringify(db);
  assert.throws(() =>
    commit(
      {
        setItem() {
          throw Error("quota");
        },
      },
      db,
    ),
  );
  assert.equal(JSON.stringify(db), before);
});
test("plan confirmation is reversible and independent of observations", () => {
  const p = seedDatabase().patients[0];
  const n = p.observations.length;
  togglePlan(p, p.plans[0], "家属");
  assert.equal(p.events.filter((e) => e.planId === "plan1").length, 1);
  togglePlan(p, p.plans[0], "家属");
  assert.equal(p.events.filter((e) => e.planId === "plan1").length, 0);
  assert.equal(p.observations.length, n);
});
test("nonclinical presets and paused monitors never inherit MAS alerts", () => {
  const db = seedDatabase();
  assert.equal(alertsFor(db.patients[1]).length, 0);
  assert.equal(alertsFor(db.patients[2]).length, 0);
  assert.ok(alertsFor(db.patients[0]).length > 0);
  db.patients[0].monitors.forEach((m) => (m.active = false));
  assert.equal(alertsFor(db.patients[0]).length, 0);
});
test("cluster alert explains the watch line in plain language", () => {
  const cluster = alertsFor(seedDatabase().patients[0]).find((a) => a.id === "cluster");
  assert.ok(cluster);
  assert.equal(cluster.title.includes("PRINTO"), false);
  assert.equal(cluster.evidence.basis.includes("PRINTO"), false);
  assert.equal(cluster.evidence.line.includes("PRINTO"), false);
  assert.equal(cluster.evidence.action.startsWith("建议"), false);
  assert.match(cluster.evidence.basis, /铁蛋白高于 684/);
  assert.match(cluster.evidence.line, /血小板观察线 181/);
});

import { monthDates, shiftMonth } from "../src/workspace/calendarMath";
test("month grid covers the month without redundant weeks", () => {
  const days = monthDates("2026-10-07");
  assert.equal(days.length, 35);
  assert.equal(monthDates("2021-02-15").length, 28);
  assert.equal(monthDates("2026-03-15").length, 42);
  assert.equal(days[0], "2026-09-28");
  assert.equal(days.at(-1), "2026-11-01");
  assert.equal(days.filter((d) => d.startsWith("2026-10")).length, 31);
});
test("calendar month navigation clamps dates across leap and year boundaries", () => {
  assert.equal(shiftMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(shiftMonth("2026-12-31", 1), "2027-01-31");
  assert.equal(shiftMonth("2026-03-31", -1), "2026-02-28");
});

import { recordDates } from "../src/workspace/recordDates";
test("patient record dates include events and report calendar spans without claiming streaks", () => {
  const patient = seedDatabase().patients[0];
  patient.observations = patient.observations
    .slice(0, 1)
    .map((o) => ({ ...o, at: "2026-10-07" }));
  patient.events = patient.events
    .slice(0, 1)
    .map((e) => ({ ...e, at: "2026-09-30T23:30" }));
  assert.deepEqual(recordDates(patient, "2026-10-08"), {
    first: "2026-09-30",
    last: "2026-10-07",
    relative: "昨天",
    span: 7,
  });
  assert.equal(recordDates(patient, "2026-10-07").relative, "今天");
  assert.equal(recordDates(patient, "2026-10-10").relative, "3 天前");
  assert.equal(
    recordDates(patient, "2026-10-06").relative,
    "1 天后（未来日期）",
  );
  patient.events = [];
  assert.equal(recordDates(patient).span, 0);
  patient.observations = [];
  assert.equal(recordDates(patient).span, null);
});

test("moving October to November synchronizes the month selection and data window", () => {
  const november = shiftMonth("2026-10-31", 1);
  assert.equal(november, "2026-11-30");
  const [start, end] = periodRange(november, "月");
  assert.deepEqual([start, end], ["2026-11-01", "2026-11-30"]);
  const selected = monthDates(november).filter((d) => d >= start && d <= end);
  assert.equal(selected.length, 30);
  assert.ok(selected.every((d) => d.startsWith("2026-11")));
  const patient = seedDatabase().patients[0];
  patient.observations = patient.observations
    .slice(0, 1)
    .map((o) => ({ ...o, metric: "temp", value: "37", at: "2026-10-31" }));
  assert.deepEqual(seriesFor(patient, "temp", start, end, "月", "").rows, []);
});

import { summarizeHistory } from "../src/workspace/historySummary";
import { rateObservation } from "../src/workspace/benchmark";
test("monthly summaries deduplicate submissions, not observations, and count admissions by event type", () => {
  const db = seedDatabase();
  const p = db.patients[0];
  const base = p.observations[0];
  const observations = [
    {...base,id:"one",group:"same",metric:"ferritin",value:"1000",at:"2026-10-01T08:00"},
    {...base,id:"two",group:"same",metric:"platelet",value:"170",at:"2026-10-01T08:00"},
    {...base,id:"three",group:"later",metric:"ferritin",value:"600",at:"2026-10-01T20:00"},
  ];
  const event = p.events[0];
  const events = [
    {...event,id:"admit",type:"住院",hospital:"住院" as const},
    {...event,id:"iv1",type:"输液",hospital:"住院" as const},
    {...event,id:"iv2",type:"输液",hospital:"住院" as const},
  ];
  const s = summarizeHistory(p, observations, events, db.metrics);
  assert.equal(s.sessions,2);
  assert.equal(s.items,3);
  assert.equal(s.records,5);
  assert.equal(s.admissions,1);
  assert.equal(s.infusions,2);
  assert.deepEqual(s.exceededIds,["one","two"]);
  assert.equal(s.assessed,3);
  p.monitors.forEach(m=>m.active=false);
  assert.equal(summarizeHistory(p,observations,events,db.metrics).assessed,0);
  assert.equal(summarizeHistory(p,[],[],db.metrics).records,0);
});
test("each patient benchmark colors only stored lines on active monitors", () => {
  const db = seedDatabase();
  const zhou = db.patients[2];
  const base = zhou.observations[0];
  const inside = { ...base, id: "in", metric: "weight", value: "68.2" };
  const outside = { ...base, id: "out", metric: "weight", value: "72.4" };
  const high = { ...base, id: "hi", metric: "bp", value: "158/96" };
  const ok = { ...base, id: "ok", metric: "bp", value: "122/76" };
  assert.equal(rateObservation(zhou, inside, "kg")?.exceeded, false);
  assert.equal(rateObservation(zhou, outside, "kg")?.note, "高于 71 kg");
  assert.match(rateObservation(zhou, high)?.note ?? "", /收缩压高于 140/);
  assert.equal(rateObservation(zhou, ok)?.exceeded, false);
  const s = summarizeHistory(zhou, [inside, outside, high, ok], [], db.metrics);
  assert.deepEqual(s.exceededIds, ["out", "hi"]);
  assert.equal(s.assessed, 4);
  delete zhou.benchmarks.weight;
  assert.equal(summarizeHistory(zhou, [outside], [], db.metrics).assessed, 0);
  zhou.monitors.forEach((m) => (m.active = false));
  zhou.benchmarks = seedDatabase().patients[2].benchmarks;
  assert.equal(summarizeHistory(zhou, [outside, high], [], db.metrics).assessed, 0);
});
test("stored patients gain demo body profile and benchmarks when those fields are missing", () => {
  const storage = memory();
  const db = seedDatabase();
  delete (db.patients[0] as { profile?: unknown }).profile;
  delete (db.patients[0] as { benchmarks?: unknown }).benchmarks;
  storage.setItem(KEY, JSON.stringify(db));
  const loaded = loadDatabase(storage);
  assert.equal(loaded.patients[0].profile.sex, "男");
  assert.equal(loaded.patients[0].profile.heightCm, 122);
  assert.equal(loaded.patients[0].profile.weightKg, 23);
  assert.equal(loaded.patients[0].benchmarks.ferritin?.high, 684);
  loaded.patients[1].profile.weightKg = 71;
  storage.setItem(KEY, JSON.stringify(loaded));
  assert.equal(loadDatabase(storage).patients[1].profile.weightKg, 71);
  assert.equal(loadDatabase(storage).patients[1].profile.heightCm, 172);
});

import { readSymptom, symptomChange, symptomValue, previousSymptom, isGradedSymptom } from "../src/workspace/symptoms";
test("symptom grades keep missing and legacy values separate from zero", () => {
  const blank = new FormData();
  assert.equal(readSymptom(blank,"joint"), null);
  blank.set("joint-note","走路不便");
  assert.throws(()=>readSymptom(blank,"joint"),/请先选择/);
  blank.set("joint","0");
  const zero = readSymptom(blank,"joint")!;
  assert.equal(zero.symptom.severity,0);
  assert.equal(zero.value,"无");
  blank.set("joint","legacy-yes");
  assert.equal(readSymptom(blank,"joint")!.symptom.severity,undefined);
  const base = seedDatabase().patients[0].observations[0];
  const old = {...base,id:"old",metric:"joint",value:"是",at:"2026-10-01"};
  assert.equal(symptomValue(old),"有症状，程度未记录");
  const moderate = {...base,id:"moderate",metric:"joint",value:"中",at:"2026-10-02T10:00",symptom:{severity:2 as const,impacts:["走路受限"],parts:[],note:"下楼困难"}};
  const mild = {...moderate,id:"mild",value:"轻",at:"2026-10-03T10:00",symptom:{...moderate.symptom,severity:1 as const}};
  assert.equal(symptomChange(moderate,[old,moderate,mild]),"程度未记录，无法比较变化");
  assert.equal(symptomChange(mild,[old,moderate,mild]),"较上次减轻 1 档");
  assert.equal(previousSymptom([old,moderate,mild],"joint","2026-10-02T09:00")!.id,"old");
  assert.equal(isGradedSymptom("cns"),false);
});
test("symptom impacts, rash locations and notes survive persistence without rewriting legacy observations", () => {
  const storage=memory();
  const db=seedDatabase();
  const form=new FormData();
  form.set("rash","2"); form.append("rash-part","躯干");form.append("rash-part","上肢");form.append("rash-impact","影响睡眠");form.set("rash-note","晚上更明显");
  const graded=readSymptom(form,"rash")!;
  const original=db.patients[0].observations[0];
  db.patients[0].observations.push({...original,id:"graded",metric:"rash",...graded});
  commit(storage,db);
  const restored=loadDatabase(storage);
  assert.deepEqual(restored.patients[0].observations.find(o=>o.id==="graded")!.symptom,{severity:2,impacts:["影响睡眠"],parts:["躯干","上肢"],note:"晚上更明显"});
  assert.deepEqual(restored.patients[0].observations[0],original);
});

test("assessment uses each metric's latest row, not an average or one upload", () => {
  const row = (metric: string, value: string, at: string, created = at) => ({
    id: metric + at,
    group: "g",
    metric,
    value,
    context: "",
    at,
    created,
    source: "手录",
    author: "测试",
  });
  const split = assessmentBasis({
    observations: [
      row("ferritin", "100", "2026-09-01"),
      row("ferritin", "900", "2026-10-07"),
      row("temp", "39", "2026-09-28"),
    ],
  });
  assert.match(split, /不是平均值/);
  assert.match(split, /每个指标只取自己最近的一条/);
  assert.match(split, /2026年9月28日（没有记下几点）/);
  assert.match(split, /2026年10月7日（没有记下几点）/);
  assert.doesNotMatch(split, /9月1日/);
  const one = assessmentBasis({
    observations: [
      row("ferritin", "900", "2026-10-07T15:40", "2026-10-08T09:05"),
      row("platelet", "170", "2026-10-07T15:40", "2026-10-08T09:05"),
    ],
  });
  assert.match(one, /记录时间是 2026年10月7日 15:40/);
  assert.match(one, /写入时间是 2026年10月8日 09:05/);
});

// Keep record-follow-up coverage in the standard test run.
import './careTodos.test';

// Scan record entry follows the same chained test run.
import './scan.test';
