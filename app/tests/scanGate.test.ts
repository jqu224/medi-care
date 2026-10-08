import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOSPITAL_REQUIRED,
  REPORT_DATE_REQUIRED,
  TEMP_DATE_REQUIRED,
  scanSaveGate,
} from "../src/workspace/scanGate";

test("report date is still required for lab reports", () => {
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

test("handwritten_temp skips hospital and accepts row dates", () => {
  const gate = scanSaveGate({
    docType: "handwritten_temp",
    reportDate: "",
    hospital: "",
    temps: [{ date: "2024-08-01", celsius: "38.6" }],
  });
  assert.equal(gate.ok, true);
});

test("handwritten_temp with values needs a date somewhere", () => {
  const gate = scanSaveGate({
    docType: "handwritten_temp",
    reportDate: "",
    temps: [{ date: "", celsius: "38.6" }],
  });
  assert.equal(gate.ok, false);
  assert.equal((gate as { message: string }).message, TEMP_DATE_REQUIRED);
});

test("handwritten_temp can fall back to reportDate", () => {
  const gate = scanSaveGate({
    docType: "handwritten_temp",
    reportDate: "2024-08-01",
    hospital: "",
    temps: [{ date: "", celsius: "38.6" }],
  });
  assert.equal(gate.ok, true);
});

test("clinical_photo does not require hospital", () => {
  assert.equal(scanSaveGate({ docType: "clinical_photo" }).ok, true);
});

test("referral requires date and hospital like lab reports", () => {
  assert.equal(
    scanSaveGate({ docType: "referral", reportDate: "2014-11-04", hospital: "" }).ok,
    false,
  );
  assert.equal(
    scanSaveGate({
      docType: "referral",
      reportDate: "2014-11-04",
      hospital: "京都儿童医院",
    }).ok,
    true,
  );
});
