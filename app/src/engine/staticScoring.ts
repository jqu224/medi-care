// 静态判分：2016 PRINTO/ACR/EULAR、2004 HLH 八选五、MS 评分表
//
// 口径全部取自官方 PRD（reference/PRD-sJIA合并MAS动态预警平台-V1.0.md §2）：
//   §2.1 发热前提下 铁蛋白 >684 ng/mL + 任意 2 条（PLT<181 / AST>48 / TG>156 / Fbg<3.6）
//   §2.2 HLH-2004 8 条中符合 5 条
//   §2.3 MS = CNS(+2.44) + 出血(+1.54) + 关节炎(−1.30) + PLT(×−0.003)
//             + LDH(×+0.001) + Fbg(×−0.004) + SF(×+0.0001)，≥ −2.1 判可能性大
//
// 设计红线：
// 1. 未测 ≠ 未达标。三态（met / not-met / not-measured）必须显式区分，
//    否则家属会把「没查」读成「没事」。
// 2. 阈值一律用指南原值，不经 effThreshold 缩放。灵敏度档位只影响动态警报，
//    静态判分是对着标准原文的刻度尺。
// 3. 三态不齐时给 insufficient，不给倾向性结论。

export type CriterionState = "met" | "not-met" | "not-measured";

export type Criterion = {
  key: string;
  label: string;
  state: CriterionState;
  /** 面向家属的一句话说明：比多少、差多少、为什么算达标 */
  detail: string;
};

export type VerdictStatus = "meet" | "not-meet" | "insufficient";

export type StandardId = "printo-2016" | "hlh-2004" | "ms-score";

export type StaticVerdict = {
  standard: StandardId;
  status: VerdictStatus;
  /** 一句话结论，大白话，不含 PRINTO/HLH 等缩写 */
  headline: string;
  detail: string;
  criteria: Criterion[];
  /** 已达标项数（not-measured 不计入） */
  metCount: number;
  /** 可评估项数（met + not-met） */
  assessableCount: number;
  /** 仅 MS 评分表有值 */
  score?: number;
};

export type Flags = {
  /** 发热：当日最高体温 */
  feverToday?: number;
  /** 发热持续天数（≥38.5℃ 连续） */
  feverStreakHigh?: number;
  cns?: boolean;
  bleeding?: boolean;
  arthritis?: boolean;
  splenomegaly?: boolean;
  hemophagocytosis?: boolean;
  /** NK 细胞活性（PRD §2.2 特殊检查） */
  nkActivityLow?: boolean;
  /** sCD25（PRD §2.2 特殊检查） */
  sCD25High?: boolean;
  /** 血细胞减少：PRD §2.2「累及外周血两系或三系」 */
  cytopeniaLines?: number;
};

export type Snapshot = {
  /** 主线指标，单位与 config.ts 的 METRICS 一致 */
  ferritin?: number; // ng/mL
  platelet?: number; // ×10⁹/L
  ast?: number; // U/L
  tg?: number; // mg/dL（主线口径，不是 HLH 的 mmol/L）
  tgMmol?: number; // mmol/L（HLH-2004 口径）
  fibrinogen?: number; // g/L
  ldh?: number; // U/L
  flags?: Flags;
};

const fmt = (n: number, digits = 0) =>
  digits ? n.toFixed(digits) : String(Math.round(n));

/* ------------------------------------------------------------------ */
/* 2016 PRINTO/ACR/EULAR                                                */
/* ------------------------------------------------------------------ */

const PRINTO_PAIR_LABELS = [
  { key: "platelet", label: "血小板" },
  { key: "ast", label: "谷草转氨酶 AST" },
  { key: "tg", label: "甘油三酯" },
  { key: "fibrinogen", label: "纤维蛋白原" },
] as const;

function stateOf(
  value: number | undefined,
  test: (v: number) => boolean,
  describe: (v: number) => string,
): CriterionState {
  if (value === undefined || !Number.isFinite(value)) return "not-measured";
  return test(value) ? "met" : "not-met";
}

export function scorePrinto2016(snap: Snapshot): StaticVerdict {
  const s = snap;
  const f = s.flags ?? {};

  // 前提一：发热。PRD §2.1「当确诊或疑似 sJIA 的患者出现发热的同时具备以下实验室指标」
  const feverMet = (f.feverToday ?? -Infinity) >= 38.5;
  const feverCriterion: Criterion = {
    key: "fever",
    label: "发热",
    state: s.flags?.feverToday === undefined ? "not-measured" : feverMet ? "met" : "not-met",
    detail:
      s.flags?.feverToday === undefined
        ? "还没有体温记录"
        : feverMet
          ? `今天最高体温 ${fmt(s.flags.feverToday, 1)}℃`
          : `今天最高体温 ${fmt(s.flags.feverToday, 1)}℃，未达发热`,
  };

  // 前提二：铁蛋白 >684 ng/mL（指南原值，不受灵敏度影响）
  const ferMet = (s.ferritin ?? -Infinity) > 684;
  const ferCriterion: Criterion = {
    key: "ferritin",
    label: "铁蛋白",
    state: stateOf(s.ferritin, (v) => v > 684, () => ""),
    detail:
      s.ferritin === undefined
        ? "还没有铁蛋白结果"
        : `铁蛋白 ${fmt(s.ferritin)} ng/mL，标准线 684`,
  };

  // 伴随 4 选 2
  const pairs: Criterion[] = PRINTO_PAIR_LABELS.map(({ key, label }) => {
    const v = s[key as keyof Snapshot] as number | undefined;
    let state: CriterionState;
    let detail: string;
    switch (key) {
      case "platelet":
        state = stateOf(v, (x) => x < 181, () => "");
        detail =
          v === undefined
            ? "还没有血小板结果"
            : `血小板 ${fmt(v)} ×10⁹/L，标准线 181（低于才算）`;
        break;
      case "ast":
        state = stateOf(v, (x) => x > 48, () => "");
        detail =
          v === undefined ? "还没有 AST 结果" : `AST ${fmt(v)} U/L，标准线 48（高于才算）`;
        break;
      case "tg":
        state = stateOf(v, (x) => x > 156, () => "");
        detail =
          v === undefined
            ? "还没有甘油三酯结果"
            : `甘油三酯 ${fmt(v)} mg/dL，标准线 156（高于才算）`;
        break;
      default:
        state = stateOf(v, (x) => x < 3.6, () => "");
        detail =
          v === undefined
            ? "还没有纤维蛋白原结果"
            : `纤维蛋白原 ${fmt(v, 1)} g/L，标准线 3.6（低于才算）`;
        break;
    }
    return { key, label, state, detail };
  });

  const metCount = pairs.filter((p) => p.state === "met").length;
  const assessableCount = pairs.filter((p) => p.state !== "not-measured").length;
  const prerequisitesMet = feverCriterion.state === "met" && ferCriterion.state === "met";

  let status: VerdictStatus;
  if (feverCriterion.state === "not-measured" || ferCriterion.state === "not-measured")
    status = "insufficient";
  else status = prerequisitesMet && metCount >= 2 ? "meet" : "not-meet";

  let headline: string;
  if (status === "insufficient") {
    const missing = [
      feverCriterion.state === "not-measured" ? "发热情况" : "",
      ferCriterion.state === "not-measured" ? "铁蛋白结果" : "",
    ].filter(Boolean);
    headline = `还缺${missing.join("和")}，暂时无法对照这套标准`;
  } else if (!feverCriterion.state || feverCriterion.state === "not-met") {
    headline = "没有同时满足发热前提，这条标准不适用";
  } else if (!ferCriterion.state || ferCriterion.state === "not-met") {
    headline = "发热但铁蛋白还没超过 684，这条标准暂不满足";
  } else if (metCount >= 2) {
    headline = `铁蛋白超过 684，另有 ${metCount} 项同时过线`;
  } else {
    const missing = pairs.filter((p) => p.state === "not-measured").length;
    headline =
      missing > 0
        ? `铁蛋白超过 684，伴随项目已达标 ${metCount} 项，还有 ${missing} 项没查`
        : `铁蛋白超过 684，伴随项目已达标 ${metCount} 项，还差 ${2 - metCount} 项`;
  }

  return {
    standard: "printo-2016",
    status,
    headline,
    detail:
      "这套标准要求：先有发热，铁蛋白超过 684 ng/mL，再有血小板、AST、甘油三酯、纤维蛋白原里的至少两项同时过线。",
    criteria: [feverCriterion, ferCriterion, ...pairs],
    metCount,
    assessableCount,
  };
}

/* ------------------------------------------------------------------ */
/* HLH-2004 八选五                                                      */
/* ------------------------------------------------------------------ */

export function scoreHlh2004(snap: Snapshot): StaticVerdict {
  const s = snap;
  const f = s.flags ?? {};

  // 甘油三酯在 HLH 里是 mmol/L >3，与主线的 mg/dL 不是同一口径，不能混用
  let tgState: CriterionState;
  let tgDetail: string;
  if (s.tgMmol !== undefined) {
    tgState = s.tgMmol > 3 ? "met" : "not-met";
    tgDetail = `甘油三酯 ${fmt(s.tgMmol, 1)} mmol/L，标准线 3`;
  } else {
    tgState = "not-measured";
    tgDetail = "还没有按 mmol/L 口径的甘油三酯结果（这套标准用的是 mmol/L，不是一般报告的 mg/dL）";
  }

  const fbgState = stateOf(s.fibrinogen, (v) => v < 1.5, () => "");
  const criteria: Criterion[] = [
    {
      key: "nk",
      label: "NK 细胞活性降低",
      state: f.nkActivityLow === undefined ? "not-measured" : f.nkActivityLow ? "met" : "not-met",
      detail:
        f.nkActivityLow === undefined
          ? "这项需要专门的免疫检查，本应用暂无录入通道"
          : f.nkActivityLow
            ? "本次结果低于参考范围"
            : "本次结果在参考范围内",
    },
    {
      key: "sCD25",
      label: "sCD25 升高",
      state: f.sCD25High === undefined ? "not-measured" : f.sCD25High ? "met" : "not-met",
      detail:
        f.sCD25High === undefined
          ? "这项需要专门的免疫检查，本应用暂无录入通道"
          : f.sCD25High
            ? "本次结果高于参考范围"
            : "本次结果在参考范围内",
    },
    {
      key: "hemophagocytosis",
      label: "骨髓/肝脾/淋巴结噬血现象",
      state: f.hemophagocytosis === undefined ? "not-measured" : f.hemophagocytosis ? "met" : "not-met",
      detail:
        f.hemophagocytosis === undefined
          ? "需要病理或骨髓检查结果，本应用暂无录入通道"
          : f.hemophagocytosis
            ? "报告提示存在噬血现象"
            : "报告未见噬血现象",
    },
    {
      key: "fever",
      label: "发热 >38.5℃ 持续 1 周以上",
      state:
        f.feverStreakHigh === undefined
          ? "not-measured"
          : f.feverStreakHigh >= 7
            ? "met"
            : "not-met",
      detail:
        f.feverStreakHigh === undefined
          ? "还没有足够的体温记录"
          : f.feverStreakHigh >= 7
            ? `已连续 ${f.feverStreakHigh} 天超过 38.5℃`
            : `连续 ${f.feverStreakHigh} 天超过 38.5℃，还没到 7 天`,
    },
    {
      key: "spleen",
      label: "脾大",
      state: f.splenomegaly === undefined ? "not-measured" : f.splenomegaly ? "met" : "not-met",
      detail:
        f.splenomegaly === undefined
          ? "这项需要查体或影像结果，本应用暂无录入通道"
          : f.splenomegaly
            ? "本次记录提示脾大"
            : "本次记录未见脾大",
    },
    {
      key: "cytopenia",
      label: "血细胞减少（累及两系或三系）",
      state:
        f.cytopeniaLines === undefined
          ? "not-measured"
          : f.cytopeniaLines >= 2
            ? "met"
            : "not-met",
      detail:
        f.cytopeniaLines === undefined
          ? "需要血常规结果"
          : f.cytopeniaLines >= 2
            ? `本次有 ${f.cytopeniaLines} 系低于参考范围`
            : f.cytopeniaLines === 1
              ? "只有 1 系低于参考范围，这套标准要求两系或以上"
              : "血常规未见血细胞减少",
    },
    {
      key: "tgFbg",
      label: "甘油三酯 >3 mmol/L 或纤维蛋白原 <1.5 g/L",
      // 二选一，任一达标即算这项达标
      state:
        tgState === "not-measured" && fbgState === "not-measured"
          ? "not-measured"
          : tgState === "met" || fbgState === "met"
            ? "met"
            : "not-met",
      detail:
        tgState === "not-measured" && fbgState === "not-measured"
          ? "这两项都还没有结果"
          : tgState === "met"
            ? "甘油三酯超过 3 mmol/L"
            : fbgState === "met"
              ? "纤维蛋白原低于 1.5 g/L"
              : tgState === "not-measured"
                ? `纤维蛋白原 ${fmt(s.fibrinogen!, 1)} g/L 在标准内；甘油三酯还没有按这套标准要求的 mmol/L 口径记录`
                : fbgState === "not-measured"
                  ? `甘油三酯 ${fmt(s.tgMmol!, 1)} mmol/L 在标准内；纤维蛋白原还没有记录`
                  : `两项都在标准内（甘油三酯 ${fmt(s.tgMmol!, 1)} mmol/L，纤维蛋白原 ${fmt(s.fibrinogen!, 1)} g/L）`,
    },
    {
      key: "ferritin",
      label: "铁蛋白 >500 µg/L",
      state: stateOf(s.ferritin, (v) => v > 500, () => ""),
      detail:
        s.ferritin === undefined
          ? "还没有铁蛋白结果"
          : `铁蛋白 ${fmt(s.ferritin)} ng/mL，标准线 500`,
    },
  ];

  const metCount = criteria.filter((c) => c.state === "met").length;
  const assessableCount = criteria.filter((c) => c.state !== "not-measured").length;
  const notMeasuredCount = criteria.length - assessableCount;

  // 8 条里有 3 条本应用没有采集通道（NK、sCD25、噬血现象），因此最多只能凑到 5 条。
  // 这 3 条永远算「未测」，但不能因此判定「不足」——那会把未采集误报成未达标。
  const status: VerdictStatus = metCount >= 5 ? "meet" : "not-meet";

  const headline =
    metCount >= 5
      ? `8 条里已达标 ${metCount} 条，达到 5 条标准`
      : notMeasuredCount > 0
        ? `8 条里已达标 ${metCount} 条，还差 ${5 - metCount} 条（另有 ${notMeasuredCount} 项本应用无法采集）`
        : `8 条里已达标 ${metCount} 条，还差 ${5 - metCount} 条`;

  return {
    standard: "hlh-2004",
    status,
    headline,
    detail:
      "这套是 2004 年的诊断标准，8 条里符合 5 条即可诊断。其中 NK 细胞活性、sCD25、骨髓噬血现象这三项需要专门检查，本应用没有录入通道，只能显示为「未采集」，请把这三项交给医生判断。",
    criteria,
    metCount,
    assessableCount,
  };
}

/* ------------------------------------------------------------------ */
/* MS 评分表                                                            */
/* ------------------------------------------------------------------ */

const MS_COEFFICIENTS = {
  cns: 2.44,
  bleeding: 1.54,
  arthritis: -1.3,
} as const;

/** 所有必需项。缺任意一项就不给结论。 */
export function scoreMsTable(snap: Snapshot): StaticVerdict {
  const s = snap;
  const f = s.flags ?? {};

  const criteria: Criterion[] = [
    {
      key: "cns",
      label: "中枢神经系统受累",
      state: f.cns === undefined ? "not-measured" : f.cns ? "met" : "not-met",
      detail:
        f.cns === undefined ? "这项还没有记录" : f.cns ? "本次记录提示有意识或抽搐表现" : "本次记录未提示",
    },
    {
      key: "bleeding",
      label: "出血现象",
      state: f.bleeding === undefined ? "not-measured" : f.bleeding ? "met" : "not-met",
      detail:
        f.bleeding === undefined ? "这项还没有记录" : f.bleeding ? "本次记录有出血点或瘀斑" : "本次记录未提示",
    },
    {
      key: "arthritis",
      label: "关节炎",
      state:
        f.arthritis === undefined ? "not-measured" : f.arthritis ? "met" : "not-met",
      detail:
        f.arthritis === undefined ? "这项还没有记录" : f.arthritis ? "本次记录有关节肿痛" : "本次记录未提示",
    },
    {
      key: "platelet",
      label: "血小板计数（系数 −0.003）",
      state: stateOf(s.platelet, () => true, () => ""),
      detail:
        s.platelet === undefined
          ? "还没有血小板结果"
          : `血小板 ${fmt(s.platelet)} ×10⁹/L`,
    },
    {
      key: "ldh",
      label: "乳酸脱氢酶 LDH（系数 +0.001）",
      state: stateOf(s.ldh, () => true, () => ""),
      detail: s.ldh === undefined ? "还没有 LDH 结果" : `LDH ${fmt(s.ldh)} U/L`,
    },
    {
      key: "fibrinogen",
      label: "纤维蛋白原（系数 −0.004）",
      state: stateOf(s.fibrinogen, () => true, () => ""),
      detail:
        s.fibrinogen === undefined ? "还没有纤维蛋白原结果" : `纤维蛋白原 ${fmt(s.fibrinogen, 1)} g/L`,
    },
    {
      key: "ferritin",
      label: "血清铁蛋白 SF（系数 +0.0001）",
      state: stateOf(s.ferritin, () => true, () => ""),
      detail: s.ferritin === undefined ? "还没有铁蛋白结果" : `铁蛋白 ${fmt(s.ferritin)} ng/mL`,
    },
  ];

  // 发热不计入公式（PRD §2.3 注明：发热作为病情活动的强制指标）
  const missing = criteria.filter((c) => c.state === "not-measured");

  if (missing.length > 0) {
    return {
      standard: "ms-score",
      status: "insufficient",
      headline: `还缺 ${missing.length} 项数据，暂时算不出这个评分`,
      detail: `缺的是：${missing.map((m) => m.label.split("（")[0]).join("、")}。补齐后这里会显示一个数值，以及它和 −2.1 这条线的距离。`,
      criteria,
      metCount: 0,
      assessableCount: criteria.length - missing.length,
    };
  }

  const score =
    (f.cns ? MS_COEFFICIENTS.cns : 0) +
    (f.bleeding ? MS_COEFFICIENTS.bleeding : 0) +
    (f.arthritis ? MS_COEFFICIENTS.arthritis : 0) +
    (s.platelet ?? 0) * -0.003 +
    (s.ldh ?? 0) * 0.001 +
    (s.fibrinogen ?? 0) * -0.004 +
    (s.ferritin ?? 0) * 0.0001;

  const rounded = Math.round(score * 100) / 100;
  const meet = rounded >= -2.1;
  const gap = Math.round(Math.abs(rounded + 2.1) * 100) / 100;

  return {
    standard: "ms-score",
    status: meet ? "meet" : "not-meet",
    headline: meet
      ? `评分 ${rounded}，已达到 −2.1 这条线`
      : `评分 ${rounded}，距离 −2.1 还差 ${gap}`,
    detail: "评分越高表示符合合并巨噬细胞活化综合征的特征越多。发热不计入这个评分（发热本身就是必须记录的病情活动指标）。这项只反映指标与特征的吻合程度，不等于诊断。",
    criteria,
    metCount: 0,
    assessableCount: criteria.length,
    score: rounded,
  };
}

export function scoreStatic(snap: Snapshot): StaticVerdict[] {
  return [scorePrinto2016(snap), scoreHlh2004(snap), scoreMsTable(snap)];
}