import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NEW_METRIC,
  cleanSeq,
  extractJson,
  extractReportDate,
  findDuplicatePhoto,
  hammingHex,
  isSimilarScan,
  itemSeqLabels,
  matchMetricAlias,
  normalizeSession,
  parseOcrLines,
  scanSignature,
  sessionFromLines,
  sessionFromOcr,
  sessionToRows,
  type OcrLine,
  type ScanItem,
  type ScanRecord,
  type ScanSession,
} from "../src/workspace/scanSession";
import {
  aiParse,
  runScanChain,
  visionConfigFromEnv,
  visionParse,
  zionFlowFromEnv,
  type VisionTransport,
} from "../src/workspace/scanEngines";
import { actorFor, loadDatabase, mutatePatient, seedDatabase } from "../src/workspace/model";

function item(patch: Partial<ScanItem>): ScanItem {
  return {
    id: patch.id ?? "it1",
    rawName: patch.rawName ?? "",
    name: patch.name ?? patch.rawName ?? "",
    value: patch.value ?? "",
    unit: patch.unit ?? "",
    refRange: patch.refRange ?? "",
    abnormal: patch.abnormal ?? "",
    target: patch.target ?? "",
  };
}
function session(items: ScanItem[], patch: Partial<ScanSession> = {}): ScanSession {
  return {
    analysis: patch.analysis ?? "",
    questions: patch.questions ?? [],
    reportDate: patch.reportDate ?? "2026-10-08",
    hospital: patch.hospital ?? "",
    items,
  };
}

test("alias maps report names to catalog metrics and blocks derived stats", () => {
  assert.equal(matchMetricAlias("血清铁蛋白"), "ferritin");
  assert.equal(matchMetricAlias("血小板计数"), "platelet");
  assert.equal(matchMetricAlias("PLT"), "platelet");
  assert.equal(matchMetricAlias("天门冬氨酸氨基转移酶(AST)"), "ast");
  assert.equal(matchMetricAlias("空腹血糖"), "glucose");
  assert.equal(matchMetricAlias("甘油三脂"), "tg");
  assert.equal(matchMetricAlias("血小板分布宽度"), "");
  assert.equal(matchMetricAlias("血小板压积"), "");
  assert.equal(matchMetricAlias("纤维蛋白原降解产物"), "");
  assert.equal(matchMetricAlias("乳酸脱氢酶同工酶1"), "");
  assert.equal(matchMetricAlias("大血小板比率"), "");
  assert.equal(matchMetricAlias("白细胞计数"), "");
  assert.equal(matchMetricAlias("C反应蛋白"), "");
});

test("report dates are extracted from mixed formats", () => {
  assert.equal(extractReportDate("采样时间：2024-08-07 08:30"), "2024-08-07");
  assert.equal(extractReportDate("报告日期 2024年8月7日"), "2024-08-07");
  assert.equal(extractReportDate("2024/8/7 出具"), "2024-08-07");
  assert.equal(extractReportDate("没有日期"), "");
});

test("ocr line parser keeps name-value pairs and skips headers and dates", () => {
  const rows = parseOcrLines(
    [
      "检验项目 结果 单位 参考范围",
      "白细胞计数 17.94 10^9/L ↑",
      "血小板 172 10^9/L ↓",
      "采样时间 2024-08-07 08:30",
      "体温 38.6 ℃",
      "C反应蛋白 <0.5 mg/L",
    ].join("\n"),
  );
  assert.deepEqual(
    rows.map((r) => r.rawName),
    ["白细胞计数", "血小板", "体温", "C反应蛋白"],
  );
  const platelet = rows.find((r) => r.rawName === "血小板")!;
  assert.equal(platelet.value, "172");
  assert.equal(platelet.abnormal, "low");
  const temp = rows.find((r) => r.rawName === "体温")!;
  assert.equal(temp.value, "38.6");
});

test("ocr 后处理修复箭头误读、乱码单位与中文名空格", () => {
  const rows = parseOcrLines(
    [
      "血清 铁 蛋 白 1650 个 ng/mL (24-336)", // ↑ 被认成「个」
      "血小板 计数 172 4 181-452", // ↓ 被认成「4」
      "谷 草 转氨酶 63 t U/L (15-48)", // ↑ 被认成「t」
      "纤维 蛋白 原 3.1 g/L 3.6-8.2",
    ].join("\n"),
  );
  const byName = Object.fromEntries(rows.map((r) => [r.rawName, r]));
  const ferritin = byName["血清铁蛋白"];
  assert.equal(ferritin.unit, "ng/mL");
  assert.equal(ferritin.abnormal, "high");
  assert.equal(ferritin.refRange, "24-336");
  const platelet = byName["血小板计数"];
  assert.equal(platelet.unit, "");
  assert.equal(platelet.abnormal, "low");
  assert.equal(platelet.refRange, "181-452");
  const ast = byName["谷草转氨酶"];
  assert.equal(ast.unit, "U/L");
  assert.equal(ast.abnormal, "high");
  const fibrinogen = byName["纤维蛋白原"];
  assert.equal(fibrinogen.abnormal, "low");
});

test("two-column report lines split at the range-index boundary", () => {
  const rows = parseOcrLines(
    "*白细胞 17.94 ×10^9/L 3.50-9.50 14HCT *红细胞压积 29.8 1% 35.0-50.0\n" +
      "淋巴细胞百分比 9.4 ↓% 20.0-40.0 20PLT *血小板 297 x10^9/L 100-350",
  );
  const byName = Object.fromEntries(rows.map((r) => [r.rawName, r]));
  const wbc = byName["白细胞"];
  assert.equal(wbc.value, "17.94");
  assert.equal(wbc.refRange, "3.50-9.50");
  assert.equal(wbc.abnormal, "high"); // 左列值配左列区间，不再错配右列
  const hct = byName["红细胞压积"];
  assert.equal(hct.value, "29.8");
  assert.equal(hct.unit, "%");
  assert.equal(hct.abnormal, "low");
  const plt = byName["血小板"];
  assert.equal(plt.value, "297");
  assert.equal(plt.abnormal, ""); // 100-350 区间内
});

function L(text: string, x0: number, y0: number, x1: number, y1: number): OcrLine {
  return { text, x0, y0, x1, y1 };
}

/* fixture 复刻 d705 真实报告：双列并排（左右各一套 名称/结果/单位/参考），
   页脚是页码与送检/报告时间——它们绝不能变成检验条目 */
const D705_LINES: OcrLine[] = [
  L("北京京都儿童医院 急诊临检（检验科）", 40, 20, 900, 45),
  L("中文名称 结果 单位 参考范围 英文 中文名称 结果 单位 参考范围", 40, 60, 1216, 85),
  L("*白细胞 17.94 ×10^9/L 3.50-9.50 14HCT *红细胞压积 29.8 1% 35.0-50.0", 40, 100, 1216, 125),
  L("淋巴细胞百分比 9.4 ↓% 20.0-40.0 15MCHC *平均红细胞血红蛋白浓 356 320-360", 40, 130, 1216, 155),
  L("淋巴细胞绝对值 1.68 x10~9/L 0.80-4.00 20PLT *血小板 297 x10^9/L 100-350", 40, 160, 1216, 185),
  L("*血红蛋白 106 g/ 110-150 25CRP C反应蛋白 121.0 tmg/L -8", 40, 190, 1216, 215),
  L("第1页共1页", 40, 600, 200, 625),
  L("寸间： 2014.12.05 18:17 送检时间：", 40, 640, 700, 665),
  L("2014.12.05 18:48 报告时间：", 40, 680, 600, 705),
];

test("region analysis: header anchors split two column groups, footer stays out", () => {
  const s = sessionFromLines(D705_LINES);
  const byName = Object.fromEntries(s.items.map((i) => [i.rawName, i]));
  assert.ok(s.analysis.includes("表格解析"));
  assert.ok(s.analysis.includes("左右两组"));
  assert.equal(s.reportDate, "2014-12-05");

  const wbc = byName["白细胞"];
  assert.equal(wbc.value, "17.94");
  assert.equal(wbc.refRange, "3.50-9.50"); // 左列值配左列区间，不再错配右列
  assert.equal(wbc.abnormal, "high");
  assert.equal(wbc.target, NEW_METRIC);

  const hct = byName["红细胞压积"];
  assert.equal(hct.value, "29.8");
  assert.equal(hct.unit, "%");
  assert.equal(hct.refRange, "35.0-50.0");
  assert.equal(hct.abnormal, "low");

  const plt = byName["血小板"];
  assert.equal(plt.value, "297");
  assert.equal(plt.refRange, "100-350");
  assert.equal(plt.abnormal, "");
  assert.equal(plt.target, "platelet");

  const hgb = byName["血红蛋白"];
  assert.equal(hgb.value, "106");
  assert.equal(hgb.refRange, "110-150");
  assert.equal(hgb.abnormal, "low");

  const mchc = byName["平均红细胞血红蛋白浓"];
  assert.equal(mchc.value, "356");
  assert.equal(mchc.refRange, "320-360");
  assert.equal(mchc.abnormal, ""); // 左组的 ↓ 不能波及右组；356 在 320-360 内
  assert.equal(hct.eng, "HCT"); // 英文缩写只挂右组
  assert.equal(plt.eng, "PLT");
  assert.equal(wbc.eng, undefined); // 左组行没有英文列
  assert.equal(plt.target, "platelet"); // 20PLT 剥序号后匹配目录

  const crp = byName["C反应蛋白"];
  assert.equal(crp.value, "121.0");
  assert.equal(crp.target, NEW_METRIC);

  // 页脚（页码/送检时间/报告时间）不进条目表
  assert.ok(!s.items.some((i) => /第|寸间|时间/.test(i.rawName)));

  // 行编号：左列一条没印，右列印刷 14…25；右列沿用原件印刷值，
  // 左列按连续性回推（fixture 只截了左 4 行，所以是 10–13；真实 d705 左列 13 行，
  // 实测回推 1–13，正好补全原件没印的那半列）
  const labels = itemSeqLabels(s.items);
  const left = s.items.map((it, i) => ({ it, l: labels[i] })).filter((x) => x.it.col === 0);
  const right = s.items.map((it, i) => ({ it, l: labels[i] })).filter((x) => x.it.col === 1);
  assert.deepEqual(left.map((x) => x.l.label), ["10", "11", "12", "13"]);
  assert.ok(left.every((x) => x.l.inferred));
  assert.deepEqual(right.map((x) => x.l.label), ["14", "15", "20", "25"]);
  assert.ok(right.every((x) => !x.l.inferred)); // 全部是照片上真实印出的序号
});

test("glued values, OCR unit variants and ordinal+eng stay attached to the right row", () => {
  // 真实照片的行特征：右列数值与名字粘连（浓356）、单位 OCR 变体（x10~9/L）、序号+英文无空格（15MCHC）
  const s = sessionFromLines([
    L("中文名称 结果 单位 参考范围 英文 中文名称 结果 单位 参考范围", 30, 60, 1216, 85),
    L("淋巴细胞百分比 9.4 ↓% 20.0-40.0 15MCHC *平均红细胞血红蛋白浓356 320-360", 30, 100, 1216, 125),
    L("淋巴细胞绝对值 1.68 x10~9/L 0.80-4.00 20PLT *血小板 297 x10^9/L 100-350", 30, 130, 1216, 155),
  ]);
  const byName = Object.fromEntries(s.items.map((i) => [i.rawName, i]));
  assert.equal(s.items.length, 4);
  const lymph = byName["淋巴细胞百分比"];
  assert.equal(lymph.eng, undefined); // 左行不挂右组的英文
  assert.equal(lymph.abnormal, "low");
  const mchc = byName["平均红细胞血红蛋白浓"]; // 粘连数值拆出
  assert.equal(mchc.eng, "MCHC");
  assert.equal(mchc.value, "356");
  assert.equal(mchc.refRange, "320-360");
  assert.equal(mchc.abnormal, ""); // 左行 ↓ 不波及；356 在区间内
  const abs = byName["淋巴细胞绝对值"];
  assert.equal(abs.unit, "x10~9/L"); // OCR 变体单位保留原样
  assert.equal(abs.abnormal, ""); // 区间内不再被邻行箭头污染
  const plt = byName["血小板"];
  assert.equal(plt.eng, "PLT");
  assert.equal(plt.target, "platelet"); // 20PLT 剥序号命中目录
  assert.equal(plt.abnormal, "");
});

test("printed row seq becomes ScanItem.seq; engraving stays clean", () => {
  const rows = parseOcrLines(
    "*白细胞 17.94 ×10^9/L 3.50-9.50 14HCT *红细胞压积 29.8 1% 35.0-50.0\n" +
      "20PLT *血小板 297 x10^9/L 100-350",
  );
  const hct = rows.find((r) => r.rawName === "红细胞压积")!;
  assert.equal(hct.seq, "14");
  const plt = rows.find((r) => r.rawName === "血小板")!;
  assert.equal(plt.seq, "20");
  // 左列行没有印刷序号，不臆造
  assert.equal(rows.find((r) => r.rawName === "白细胞")!.seq, undefined);

  const s = sessionFromLines(D705_LINES);
  const byName = Object.fromEntries(s.items.map((i) => [i.rawName, i]));
  assert.equal(byName["红细胞压积"].seq, "14");
  assert.equal(byName["平均红细胞血红蛋白浓"].seq, "15");
  assert.equal(byName["血小板"].seq, "20");
  assert.equal(byName["C反应蛋白"].seq, "25");
  assert.equal(byName["白细胞"].seq, undefined); // 左列没印编号
});

test("itemSeqLabels: printed seq wins, gaps filled, left column back-filled", () => {
  const seqOf = (seq: string[] | (string | undefined)[]) =>
    itemSeqLabels(seq.map((s) => ({ seq: s })));

  // d705 真图版面：右列印刷 14..17，左侧一行没印 → 按连续序回推 13,12,11
  const d705 = seqOf(["", "", "", "14", "15", "16", "17"]);
  assert.deepEqual(
    d705.map((x) => x.label),
    ["11", "12", "13", "14", "15", "16", "17"],
  );
  assert.deepEqual(
    d705.map((x) => x.inferred),
    [true, true, true, false, false, false, false],
  );

  // 已知序号之间跳号：中间两行按前一项 +1 补
  const gap = seqOf(["14", "", "", "18"]);
  assert.deepEqual(gap.map((x) => x.label), ["14", "15", "16", "18"]);

  // 整份报告都没印序号：按录入顺序 1..N，全部标为推断
  const plain = seqOf(["", "", ""]);
  assert.deepEqual(plain.map((x) => x.label), ["1", "2", "3"]);
  assert.ok(plain.every((x) => x.inferred));

  // 从 1 开始印刷的清单：后续行前推
  const fromOne = seqOf(["1", "", ""]);
  assert.deepEqual(fromOne.map((x) => x.label), ["1", "2", "3"]);
  assert.deepEqual(fromOne.map((x) => x.inferred), [false, true, true]);

  // 回推会跌破 1 时，该行退回录入顺序
  const broken = seqOf(["", "2"]);
  assert.deepEqual(broken.map((x) => x.label), ["1", "2"]);

  assert.deepEqual(itemSeqLabels([]), []);
});

test("cleanSeq strips ordinal decoration from AI output", () => {
  assert.equal(cleanSeq("14"), "14");
  assert.equal(cleanSeq(" 第14项 "), "14");
  assert.equal(cleanSeq("No.7"), "7");
  assert.equal(cleanSeq("14HCT"), "14");
  assert.equal(cleanSeq(""), "");
  assert.equal(cleanSeq("一二三"), "");
  assert.equal(cleanSeq("1234"), "");
});

test("two-column reading order goes left column top-down, then right column", () => {
  const s = sessionFromLines([
    L("中文名称 结果 单位 参考范围 英文 中文名称 结果 单位 参考范围", 30, 60, 1216, 85),
    L("*白细胞 17.94 ×10^9/L 3.50-9.50 14HCT *红细胞压积 29.8 1% 35.0-50.0", 30, 100, 1216, 125),
    L("淋巴细胞百分比 9.4 ↓% 20.0-40.0 15MCHC *平均红细胞血红蛋白浓356 320-360", 30, 130, 1216, 155),
    L("淋巴细胞绝对值 1.68 x10~9/L 0.80-4.00 20PLT *血小板 297 x10^9/L 100-350", 30, 160, 1216, 185),
  ]);
  // 校对顺序 = 原件阅读顺序：左列 3 项自上而下，然后右列 3 项
  assert.deepEqual(
    s.items.map((i) => i.rawName),
    ["白细胞", "淋巴细胞百分比", "淋巴细胞绝对值", "红细胞压积", "平均红细胞血红蛋白浓", "血小板"],
  );
  assert.deepEqual(
    s.items.map((i) => i.col),
    [0, 0, 0, 1, 1, 1],
  );
  assert.ok(s.analysis.includes("已按左列→右列顺序排好"));
});

test("region analysis falls back to line parsing without a table header", () => {
  const s = sessionFromLines([
    L("2024-08-07", 0, 0, 120, 20),
    L("体温 38.6 ℃", 0, 40, 300, 60),
    L("血清铁蛋白 1392 ng/mL ↑", 0, 80, 400, 100),
  ]);
  assert.ok(s.analysis.includes("无表头"));
  assert.equal(s.items.length, 2);
  assert.equal(s.items.find((i) => i.rawName === "体温")!.target, "temp");
  assert.equal(s.items.find((i) => i.rawName === "血清铁蛋白")!.target, "ferritin");
});

test("sessionFromOcr keeps every parsed row and flags catalog matches", () => {
  const s = sessionFromOcr(
    "2024-08-07\n白细胞计数 17.94 ↑\n血清铁蛋白 1392 ng/mL ↑\n血小板 172 ↓",
  );
  assert.equal(s.reportDate, "2024-08-07");
  assert.equal(s.items.length, 3);
  const unmatched = s.items.find((i) => i.rawName === "白细胞计数")!;
  assert.equal(unmatched.target, NEW_METRIC); // 未知指标默认新建，不能悄悄丢掉
  assert.equal(unmatched.value, "17.94");
  assert.deepEqual(
    s.items.filter((i) => i.target !== NEW_METRIC).map((i) => i.target),
    ["ferritin", "platelet"],
  );
  assert.ok(s.analysis.includes("3 行"));
  assert.ok(s.analysis.includes("2 项匹配"));
  assert.ok(s.analysis.includes("1 项将新建"));
});

function recordOf(patch: Partial<ScanRecord>): ScanRecord {
  return {
    id: patch.id ?? "s1",
    photoId: "p1",
    createdAt: "2026-10-09T10:00",
    author: "小宇",
    engine: "ocr",
    session: patch.session ?? session([]),
    group: patch.group ?? "g1",
    ...patch,
  };
}

test("photo fingerprints detect exact and near duplicates", () => {
  assert.equal(hammingHex("0000", "0000"), 0);
  assert.equal(hammingHex("0", "1"), 1);
  assert.equal(hammingHex("0f", "f0"), 8);
  assert.equal(hammingHex("00", "000"), Infinity);

  const existing = [
    recordOf({ id: "a", photoHash: "aa", photoAhash: "00000000" }),
  ];
  assert.equal(findDuplicatePhoto(existing, "aa", "ffffffff")?.kind, "exact");
  const near = findDuplicatePhoto(existing, "bb", "0000000f");
  assert.equal(near?.kind, "similar");
  assert.equal(near?.scan.id, "a");
  assert.equal(findDuplicatePhoto(existing, "bb", "ffffffff"), null);
});

test("scan similarity needs same date and overlapping signatures", () => {
  const base = session(
    [
      item({ id: "a", rawName: "铁蛋白", target: "ferritin", value: "980" }),
      item({ id: "b", rawName: "血小板", target: "platelet", value: "172" }),
      item({ id: "c", rawName: "AST", target: "ast", value: "63" }),
    ],
    { reportDate: "2026-09-28" },
  );
  assert.deepEqual(scanSignature(base), [
    "ast=63",
    "ferritin=980",
    "platelet=172",
  ]);
  assert.ok(isSimilarScan(base, base));
  const sameDateDifferentValues = session(
    [
      item({ id: "a", rawName: "铁蛋白", target: "ferritin", value: "1400" }),
      item({ id: "b", rawName: "血小板", target: "platelet", value: "150" }),
      item({ id: "c", rawName: "AST", target: "ast", value: "40" }),
    ],
    { reportDate: "2026-09-28" },
  );
  assert.ok(!isSimilarScan(base, sameDateDifferentValues));
  const otherDate = session(base.items.map((i) => ({ ...i })), {
    reportDate: "2026-09-29",
  });
  assert.ok(!isSimilarScan(base, otherDate));
  const bigger = session(
    [
      ...base.items.map((i) => ({ ...i })),
      item({ id: "d", rawName: "LDH", target: "ldh", value: "800" }),
      item({ id: "e", rawName: "体温", target: "temp", value: "39" }),
      item({ id: "f", rawName: "纤维蛋白原", target: "fibrinogen", value: "3.1" }),
    ],
    { reportDate: "2026-09-28" },
  );
  assert.ok(!isSimilarScan(base, bigger)); // 条数相差 3 直接不相似
  const plusTwo = session(
    [
      ...base.items.map((i) => ({ ...i })),
      item({ id: "d", rawName: "LDH", target: "ldh", value: "800" }),
    ],
    { reportDate: "2026-09-28" },
  );
  assert.ok(isSimilarScan(base, plusTwo)); // 差一条且完全包含，疑似重复
  assert.ok(!isSimilarScan(base, session([], { reportDate: "2026-09-28" })));
});

test("normalizeSession sanitizes untrusted vision JSON", () => {
  const s = normalizeSession({
    analysis: "血常规报告",
    questions: [
      { text: "记到哪天？", options: ["08-07", "08-06", "", 3], kind: "date" },
      { text: "", options: ["x"] },
      { text: "q2", options: ["a"] },
      { text: "q3", options: ["a"] },
      { text: "q4", options: ["a"] },
    ],
    reportDate: "2024/8/7",
    hospital: 42,
    items: [
      { rawName: "血清铁蛋白", value: "1392", unit: "ng/mL", abnormal: "high", junk: 1 },
      { rawName: "  ", value: "1" },
      { rawName: "血小板", value: "172" },
      { name: "体温", value: "38.6" },
      { rawName: "白细胞计数", value: "17.94", unit: "×10^9/L", refRange: "3.5-9.5" },
      { rawName: "序号", value: "3" },
    ],
    extra: "drop me",
  });
  assert.equal(s.reportDate, "2024-08-07");
  assert.equal(s.hospital, "");
  assert.equal(s.questions.length, 2);
  assert.equal(s.questions[0].options.length, 2);
  assert.equal(s.items.length, 5);
  assert.deepEqual(
    s.items.map((i) => i.target),
    ["ferritin", "platelet", "temp", NEW_METRIC, ""],
  );
});

test("sessionToRows validates values and expands custom metrics", () => {
  const ok = sessionToRows(
    session([
      item({ id: "a", rawName: "血清铁蛋白", target: "ferritin", value: "980" }),
      item({ id: "b", rawName: "备注", target: "", value: "1" }),
      item({ id: "c", rawName: "血小板", target: "platelet", value: " " }),
      item({ id: "d", rawName: "游离三碘甲状腺原氨酸", target: NEW_METRIC, value: "3.12", unit: "pmol/L" }),
    ]),
  );
  assert.equal(ok.error, "");
  assert.equal(ok.rows.length, 2);
  assert.deepEqual(ok.rows[0], { itemId: "a", metric: "ferritin", value: "980" });
  assert.deepEqual(ok.rows[1].custom, { name: "游离三碘甲状腺原氨酸", unit: "pmol/L" });

  const bad = sessionToRows(
    session([item({ id: "a", rawName: "体温", target: "temp", value: "38.6℃" })]),
  );
  assert.equal(bad.rows.length, 0);
  assert.ok(bad.error.includes("体温"));

  // 单位对齐：% ↔ 目录单位不一致 → 阻断；×10^9/L 与目录 ×10⁹/L 归一化等价 → same
  const lookup = (id: string) =>
    id === "platelet"
      ? { name: "血小板", unit: "×10⁹/L" }
      : id === "temp"
        ? { name: "体温", unit: "℃" }
        : undefined;
  const aligned = sessionToRows(
    session([
      item({ id: "a", rawName: "血小板", target: "platelet", value: "297", unit: "x10^9/L" }),
      item({ id: "b", rawName: "血小板", target: "platelet", value: "1.72", unit: "x10^11/L" }),
      item({ id: "c", rawName: "体温", target: "temp", value: "38.6", unit: "%" }),
    ]),
    lookup,
  );
  assert.equal(aligned.rows[0].value, "297");
  assert.equal(aligned.rows[0].unitNote?.kind, "same");
  assert.equal(aligned.rows[1].value, "172"); // 1.72×10¹¹/L = 172×10⁹/L（k=+2）
  assert.equal(aligned.rows[1].unitNote?.kind, "convert");
  assert.equal(aligned.rows[1].unitNote?.k, 2);
  assert.equal(aligned.blocked.length, 1); // 体温 % 对 ℃ 维度不同
  assert.ok(aligned.blocked[0].includes("体温"));
});

test("extractJson survives code fences and surrounding prose", () => {
  const parsed = extractJson(
    '好的，以下是结果：\n```json\n{"analysis":"ok","items":[]}\n```\n祝好',
  ) as { analysis: string };
  assert.equal(parsed.analysis, "ok");
  assert.throws(() => extractJson("没有 JSON"));
});

test("vision config requires all three env vars", () => {
  assert.equal(visionConfigFromEnv({}), null);
  assert.equal(
    visionConfigFromEnv({ VITE_VISION_BASE_URL: "https://x/", VITE_VISION_API_KEY: "k" }),
    null,
  );
  assert.equal(
    visionConfigFromEnv({
      VITE_VISION_BASE_URL: "https://x/",
      VITE_VISION_API_KEY: "k",
      VITE_VISION_MODEL: "m",
    })?.baseUrl,
    "https://x",
  );
});

const okTransport =
  (content: string): VisionTransport =>
  async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });

test("visionParse posts auth header and normalizes the reply", async () => {
  let seen: { url: string; init: Parameters<VisionTransport>[1] } | null = null;
  const transport: VisionTransport = async (url, init) => {
    seen = { url, init };
    return okTransport(
      '{"analysis":"血常规","items":[{"rawName":"血清铁蛋白","value":"1392","abnormal":"high"}]}',
    )(url, init);
  };
  const { session, raw } = await visionParse({
    config: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m" },
    dataUrl: "data:image/jpeg;base64,x",
    transport,
  });
  assert.equal(seen!.url, "https://api.example.com/v1/chat/completions");
  assert.equal(seen!.init.headers.authorization, "Bearer k");
  assert.equal(session.items[0].target, "ferritin");
  assert.ok(raw.includes("血常规"));
});

test("zion flow mode keeps the api key out of the browser", async () => {
  assert.equal(zionFlowFromEnv({}), null);
  assert.ok(
    zionFlowFromEnv({ VITE_ZION_SCAN_FLOW_ID: "f1" })!.endpoint.includes(
      "graphql-v2",
    ),
  );
  assert.equal(
    zionFlowFromEnv({
      VITE_ZION_SCAN_FLOW_ID: "f1",
      VITE_ZION_API: "https://x/",
    })!.endpoint,
    "https://x",
  );
  let seen: { url: string; body: string } | null = null;
  const transport: VisionTransport = async (url, init) => {
    seen = { url, body: init.body };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          fz_invoke_action_flow:
            '{"analysis":"ok","items":[{"rawName":"白细胞计数","value":"17.94","unit":"×10^9/L"}]}',
        },
      }),
    };
  };
  const parsed = await aiParse({
    env: { VITE_ZION_SCAN_FLOW_ID: "f1" },
    dataUrl: "data:image/jpeg;base64,x",
    transport,
  });
  assert.ok(parsed);
  assert.equal(parsed!.session.items[0].target, NEW_METRIC);
  assert.ok(seen!.body.includes("fz_invoke_action_flow"));
  assert.ok(!seen!.body.includes("Bearer"));

  const zionDown = await runScanChain({
    dataUrl: "d",
    env: { VITE_ZION_SCAN_FLOW_ID: "f1" },
    transport: async () => {
      throw Error("行为流未发布");
    },
    recognizer: async () => [L("血清铁蛋白 1392 ng/mL ↑", 0, 0, 400, 20)],
  });
  assert.equal(zionDown.engine, "ocr");
  assert.ok(zionDown.note.includes("AI 识别未成功"));
});

test("scan chain degrades: no config to ocr, vision failure to ocr, both to manual", async () => {
  const sampleLines = [
    L("血清铁蛋白 1392 ng/mL ↑", 0, 0, 400, 20),
    L("血小板 172 ↓", 0, 40, 400, 60),
  ];
  const ocr = sessionFromLines(sampleLines);
  assert.equal(ocr.items.length, 2);

  const noConfig = await runScanChain({
    dataUrl: "data:image/jpeg;base64,x",
    env: {},
    recognizer: async () => sampleLines,
  });
  assert.equal(noConfig.engine, "ocr");
  assert.ok(noConfig.note.includes("未配置"));

  const visionDown = await runScanChain({
    dataUrl: "data:image/jpeg;base64,x",
    env: {
      VITE_VISION_BASE_URL: "https://x",
      VITE_VISION_API_KEY: "k",
      VITE_VISION_MODEL: "m",
    },
    transport: async () => {
      throw Error("网络不可用");
    },
    recognizer: async () => sampleLines,
  });
  assert.equal(visionDown.engine, "ocr");
  assert.ok(visionDown.note.includes("AI 识别未成功"));

  const allDown = await runScanChain({
    dataUrl: "data:image/jpeg;base64,x",
    env: {},
    recognizer: async () => {
      throw Error("模型加载失败");
    },
  });
  assert.equal(allDown.engine, "manual");
  assert.ok(allDown.session.analysis.includes("手动填写"));
  assert.ok(allDown.note.includes("本地识别未成功"));

  const visionUp = await runScanChain({
    dataUrl: "data:image/jpeg;base64,x",
    env: {
      VITE_VISION_BASE_URL: "https://x",
      VITE_VISION_API_KEY: "k",
      VITE_VISION_MODEL: "m",
    },
    transport: okTransport('{"analysis":"ok","items":[{"rawName":"体温","value":"39.1"}]}'),
    recognizer: async () => {
      throw Error("不应走到本地识别");
    },
  });
  assert.equal(visionUp.engine, "vision");
  assert.equal(visionUp.session.items[0].target, "temp");
});

test("scans live on the patient and doctors cannot write them", () => {
  const db = seedDatabase();
  const record = {
    id: "scan1",
    photoId: "photo1",
    createdAt: "2026-10-08T10:00",
    author: "林女士（家属）",
    engine: "manual" as const,
    session: session([]),
    group: "g1",
  };
  const next = mutatePatient(db, actorFor("family"), "p1", (p) => {
    p.scans = [...(p.scans ?? []), record];
  });
  assert.equal(next.patients[0].scans?.length, 1);
  assert.throws(() =>
    mutatePatient(next, actorFor("doctor"), "p1", (p) => {
      p.scans!.push(record);
    }),
  );

  const storage = new Map<string, string>();
  storage.set("nuanshao:workspace:v2", JSON.stringify(next));
  const restored = loadDatabase({
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  });
  assert.equal(restored.patients[0].scans?.length, 1);
  assert.deepEqual(restored.patients[1].scans, []);
  const legacy = JSON.parse(JSON.stringify(next));
  delete legacy.patients[0].scans;
  storage.set("nuanshao:workspace:v2", JSON.stringify(legacy));
  const healed = loadDatabase({
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  });
  assert.deepEqual(healed.patients[0].scans, []);
});
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkUnit,
  convertNote,
  factorLabel,
  normUnitText,
  parseUnit,
  prettyUnit,
  scaleDecimal,
} from "../src/workspace/scanUnits";

test("unit normalization handles superscripts, OCR variants and fullwidth", () => {
  assert.equal(normUnitText("×10⁹/L"), "x10^9/l");
  assert.equal(normUnitText("X10A9/L"), "x10^9/l");
  assert.equal(normUnitText("x10~9/L"), "x10^9/l");
  assert.equal(normUnitText("１０＾９/L"), "10^9/l");
  assert.equal(normUnitText("％"), "%");
  assert.equal(normUnitText("μmol/L"), "umol/l");
});

test("prettyUnit: all 10-power spellings render as one hat form", () => {
  // 「10 的 9 次方」的常见写法都归一到 ×10⁹（上标），波浪线/帽子/上标丢失都认
  for (const raw of [
    "×10⁹/L",
    "x10~9/L",
    "×10^9/L",
    "×109/L",
    "x10a9/L",
    "１０＾９/L",
  ])
    assert.equal(prettyUnit(raw), "×10⁹/L", raw);
  // 负指数（帽子/减号连接）与裸 10 幂（无系数写法）也统一成 × 前缀
  assert.equal(prettyUnit("×10^-9/L"), "×10⁻⁹/L");
  assert.equal(prettyUnit("10-9/L"), "×10⁻⁹/L");
  assert.equal(prettyUnit("x10-9/L"), "×10⁻⁹/L");
  assert.equal(prettyUnit("10~12/L"), "×10¹²/L");
  assert.equal(prettyUnit("x10^11/L"), "×10¹¹/L");
  // 系数保留、非 10 幂单位原样
  assert.equal(prettyUnit("1.72×10¹¹/L"), "1.72×10¹¹/L");
  assert.equal(prettyUnit("g/L"), "g/L");
  assert.equal(prettyUnit("℃"), "℃");
  assert.equal(prettyUnit(""), "");
  // 展示归一不影响识别：各种写法本来就是同一个单位
  assert.equal(checkUnit("x10~9/L", "×10⁹/L").kind, "same");
  assert.equal(checkUnit("×109/L", "×10⁹/L").kind, "same");
  assert.equal(checkUnit("×10^9/L", "x10~9/L").kind, "same");
  assert.equal(checkUnit("10~12/L", "×10¹²/L").kind, "same");
  assert.equal(checkUnit("x10-9/L", "×10⁻⁹/L").kind, "same");
});

test("checkUnit: same / convert / unknown / incompatible", () => {
  assert.equal(checkUnit("×10⁹/L", "x10^9/L").kind, "same");
  assert.equal(checkUnit("×10³/μL", "×10⁹/L").kind, "same");
  assert.deepEqual(checkUnit("10⁸/mL", "10⁹/L"), { kind: "convert", k: 2 }); // 10⁸/mL = 10¹¹/L
  assert.deepEqual(checkUnit("ng/mL", "μg/L"), { kind: "same" });
  assert.deepEqual(checkUnit("1.72×10¹¹/L", "×10⁹/L"), { kind: "convert", k: 2 });
  assert.deepEqual(checkUnit("%", "‰"), { kind: "convert", k: 1 });
  assert.deepEqual(checkUnit("mg/dL", "g/L"), { kind: "convert", k: -2 });
  assert.equal(checkUnit("%", "℃").kind, "incompatible");
  assert.equal(checkUnit("g/L", "U/L").kind, "incompatible");
  assert.equal(checkUnit("tmg/L", "mg/L").kind, "unknown");
  assert.equal(checkUnit("", "mg/L").kind, "unknown"); // 空单位对非空目录单位：无法核对
  assert.equal(checkUnit("次/分", "次/分").kind, "same");
  assert.equal(checkUnit("mmHg", "mmHg").kind, "same");
});

test("scaleDecimal shifts the decimal point exactly", () => {
  assert.equal(scaleDecimal("1.72", 2), "172");
  assert.equal(scaleDecimal("172", -2), "1.72");
  assert.equal(scaleDecimal("0.2", 1), "2");
  assert.equal(scaleDecimal("9.4", 1), "94");
  assert.equal(scaleDecimal("123", 0), "123");
  assert.equal(scaleDecimal("0.001", 3), "1");
  assert.equal(scaleDecimal("3", -2), "0.03");
  assert.equal(scaleDecimal("-1.5", 1), "-15");
  assert.equal(scaleDecimal("abc", 2), "abc");
  assert.equal(scaleDecimal("1.5", 20), "1.5");
});

test("factorLabel writes the multiplier as multiply/divide a decimal", () => {
  // 1.72×10¹¹/L → ×10⁹/L：原图单位是目录单位的 100 倍，数值乘以 100
  assert.equal(factorLabel(2), "乘以 100");
  assert.equal(factorLabel(1), "乘以 10");
  assert.equal(factorLabel(-2), "除以 100");
  assert.equal(factorLabel(-3), "除以 1000");
  assert.equal(factorLabel(5), "乘以 10⁵");
  assert.equal(factorLabel(-6), "除以 10⁶");
});

test("convertNote says what to do and why (原图单位 → 目录单位)", () => {
  assert.equal(
    convertNote(2, "×10¹¹/L", "×10⁹/L"),
    "数值乘以 100 换算入库（原图 ×10¹¹/L → 目录 ×10⁹/L）",
  );
  assert.equal(
    convertNote(-2, "mg/dL", "g/L"),
    "数值除以 100 换算入库（原图 mg/dL → 目录 g/L）",
  );
  assert.equal(
    convertNote(1, "%", "‰"),
    "数值乘以 10 换算入库（原图 % → 目录 ‰）",
  );
  assert.ok(convertNote(3, "  ", "").includes("无单位"));
});

test("parseUnit maps dimensions with 10-power", () => {
  assert.deepEqual(parseUnit("×10⁹/L"), { dim: "count", e: 9, text: "x10^9/l" });
  assert.deepEqual(parseUnit("/μL"), { dim: "count", e: 6, text: "/ul" });
  assert.equal(parseUnit("%")?.dim, "ratio");
  assert.equal(parseUnit("mg/dL")?.e, -2);
  assert.equal(parseUnit("g/L")?.e, 0);
  assert.equal(parseUnit("U/L")?.dim, "enzyme");
  assert.equal(parseUnit("mmol/L")?.e, -3);
  assert.equal(parseUnit("℃")?.dim, "temp");
});
