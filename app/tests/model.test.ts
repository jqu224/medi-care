import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actorFor,
  allowedPatients,
  alertsFor,
  commit,
  KEY,
  loadDatabase,
  mutatePatient,
  periodRange,
  seedDatabase,
  seriesFor,
  togglePlan,
} from "../src/workspace/model";
import { todayISO } from "../src/lib/date";
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
  assert.equal(seriesFor(p, "temp", todayISO(), todayISO(), "日").length, 2);
  assert.equal(
    seriesFor(p, "temp", todayISO(), todayISO(), "周")[0].value,
    "39",
  );
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
test("glucose contexts and empty periods do not fabricate data", () => {
  const p = seedDatabase().patients[1];
  assert.equal(
    seriesFor(p, "glucose", "2020-01-01", "2020-01-31", "月").length,
    0,
  );
  assert.equal(
    seriesFor(p, "glucose", "2020-01-01", "2030-01-01", "月", "餐后").length,
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
  assert.deepEqual(seriesFor(patient, "temp", start, end, "月", ""), []);
});

import { summarizeHistory } from "../src/workspace/historySummary";
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
