import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOSPITAL_REQUIRED,
  REPORT_DATE_REQUIRED,
  scanSaveGate,
} from "../src/workspace/scanGate";

test("report date is still required", () => {
  const gate = scanSaveGate({ reportDate: "", hospital: "某儿童医院" });
  assert.equal(gate.ok, false);
  assert.equal((gate as { message: string }).message, REPORT_DATE_REQUIRED);
});

test("hospital is required even when the date is present", () => {
  const gate = scanSaveGate({ reportDate: "2026-10-08", hospital: "" });
  assert.equal(gate.ok, false);
  assert.equal((gate as { message: string }).message, HOSPITAL_REQUIRED);
});

test("a whitespace-only hospital does not pass", () => {
  for (const hospital of ["", "   ", "\t", "\n  "]) {
    const gate = scanSaveGate({ reportDate: "2026-10-08", hospital });
    assert.equal(gate.ok, false, `「${hospital}」应被拒绝`);
  }
});

test("a hospital name passes the gate", () => {
  const gate = scanSaveGate({ reportDate: "2026-10-08", hospital: "北京京都儿童医院" });
  assert.equal(gate.ok, true);
});

test("a missing hospital key is treated as empty", () => {
  const gate = scanSaveGate({ reportDate: "2026-10-08" });
  assert.equal(gate.ok, false);
});

test("the hospital prompt explains why it matters", () => {
  assert.match(HOSPITAL_REQUIRED, /医院/);
  assert.match(HOSPITAL_REQUIRED, /转诊|参考/, "要说清价值，不只是写「必填」");
  assert.doesNotMatch(HOSPITAL_REQUIRED, /必填。?$/, "不要用干巴巴的「必填」结尾");
});