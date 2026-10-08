// 单位科学计数法归一化：把报告单位与目录单位归到「维度 + 10 的幂」再比较。
// 例：×10⁹/L ≡ x10~9/L ≡ ×10³/μL；10⁸/mL = 10¹¹/L；% → ‰ 是 +1 幂；ng/mL ≡ μg/L。
// checkUnit 四态：same（等价）/ convert（可 10^k 换算）/ unknown（认不出，提示核对）/ incompatible（维度不同，拒绝）。

export type UnitDim =
  | "count"
  | "ratio"
  | "mass"
  | "enzyme"
  | "molar"
  | "temp"
  | "other";

export type UnitInfo = { dim: UnitDim; e: number; text: string };

const SUP: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

/** 归一化文本：小写、全角数字、×/* → x、μ → u、上标 → ^n、10~9/10a9（OCR 变体）→ 10^9 */
export function normUnitText(raw: string): string {
  let s = (raw ?? "").trim().toLowerCase();
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/％/g, "%").replace(/[×＊*]/g, "x").replace(/[μµ]/g, "u");
  s = s.replace(/[＾ˆ]/g, "^").replace(/／/g, "/").replace(/⁻/g, "-");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUP[c] ?? c);
  s = s.replace(/\s+/g, "");
  // 10^9 / 10~9 / 10a9 / 10-9 → 统一成 10^9（含负指数 10^-9）；
  // 要求 10 在行首、x 或 / 之后，且后面不再跟数字
  s = s.replace(/(^|[x/])10[~a^]?(-?\d{1,2})(?!\d)/g, "$1" + "10^$2");
  return s;
}

const VOL_EXP: Record<string, number> = {
  l: 0,
  dl: -1,
  ml: -3,
  ul: -6,
  nl: -9,
  cm3: -3,
  mm3: -6,
};
const MASS_EXP: Record<string, number> = {
  g: 0,
  kg: 3,
  mg: -3,
  ug: -6,
  ng: -9,
  pg: -12,
  "": 0,
};
const MOL_EXP: Record<string, number> = {
  mol: 0,
  mmol: -3,
  umol: -6,
  nmol: -9,
};
const ACT_EXP: Record<string, number> = {
  u: 0,
  iu: 0,
  mu: -3,
  miu: -3,
  ku: 3,
  kiu: 3,
};

export function parseUnit(raw: string): UnitInfo | null {
  const s = normUnitText(raw);
  if (!s) return null;
  if (s === "%") return { dim: "ratio", e: -2, text: s };
  if (s === "‰") return { dim: "ratio", e: -3, text: s };
  if (s === "ratio") return { dim: "ratio", e: 0, text: s };
  if (s === "°c" || s === "c" || s === "℃") return { dim: "temp", e: 0, text: s };
  const m = s.match(/^(.*?)\/([^/]+)$/);
  if (!m) return { dim: "other", e: 0, text: s };
  const num = m[1];
  const vol = VOL_EXP[m[2]];
  if (vol === undefined) return null;
  const ep = vol;
  /* ×10⁹、1.72×10¹¹、10^9 / 10~9（已归一）等形式；系数不影响单位幂 */
  let mm = num.match(/^(?:\d+(?:\.\d+)?)?x?10\^(-?\d+)$/);
  if (mm) return { dim: "count", e: Number(mm[1]) - ep, text: s };
  if (num === "10" || num === "x10") return { dim: "count", e: 1 - ep, text: s };
  /* 「/μL」「/L」这类只有分母的写法按细胞计数处理（个/μL = 10⁶/L） */
  if (num === "") return { dim: "count", e: -ep, text: s };
  mm = num.match(/^(k|m|u|n|p)?g$/);
  if (mm) return { dim: "mass", e: (MASS_EXP[(mm[1] ?? "") + "g"] ?? 0) - ep, text: s };
  mm = num.match(/^(k|m)?(u|iu)$/);
  if (mm)
    return {
      dim: "enzyme",
      e: (ACT_EXP[(mm[1] ?? "") + mm[2]] ?? 0) - ep,
      text: s,
    };
  mm = num.match(/^(k|m|u|n)?mol$/);
  if (mm) {
    const key = (mm[1] ?? "") + "mol";
    return { dim: "molar", e: (MOL_EXP[key] ?? 0) - ep, text: s };
  }
  return null;
}

export type UnitCheck =
  | { kind: "same" }
  | { kind: "convert"; k: number }
  | { kind: "unknown" }
  | { kind: "incompatible" };

export function checkUnit(fromRaw: string, toRaw: string): UnitCheck {
  const nf = normUnitText(fromRaw);
  const nt = normUnitText(toRaw);
  /* 归一化文本相同（含都为空）直接等价，覆盖 次/分、mmHg 这类无法归一化的单例单位 */
  if (nf === nt) return { kind: "same" };
  const a = parseUnit(fromRaw);
  const b = parseUnit(toRaw);
  if (!a || !b) return { kind: "unknown" };
  if (a.dim !== b.dim) return { kind: "incompatible" };
  if (a.dim === "other") return { kind: "incompatible" };
  if (a.e === b.e) return { kind: "same" };
  return { kind: "convert", k: a.e - b.e };
}

/** 十进制字符串按 10^k 移位（字符串运算，无浮点误差）；
    k>0 左移放大，k<0 右移缩小；非法输入原样返回 */
export function scaleDecimal(value: string, k: number): string {
  if (!k || k > 12 || k < -12) return value;
  const neg = value.startsWith("-");
  const raw = neg ? value.slice(1) : value;
  const m = raw.match(/^(\d+)(?:\.(\d*))?$/);
  if (!m) return value;
  const intPart = m[1];
  const fracPart = m[2] ?? "";
  const digits = intPart + fracPart;
  const point = intPart.length + k;
  let out: string;
  if (point <= 0) {
    out = "0." + "0".repeat(-point) + digits;
  } else if (point >= digits.length) {
    out = (digits + "0".repeat(point - digits.length)).replace(/^0+(?=\d)/, "");
  } else {
    const intOut = digits.slice(0, point).replace(/^0+(?=\d)/, "");
    const fracOut = digits.slice(point).replace(/0+$/, "");
    out = intOut + (fracOut ? "." + fracOut : "");
  }
  return (neg ? "-" : "") + out;
}

const SUP_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

function supNum(n: number | string): string {
  return String(n)
    .split("")
    .map((d) => (d === "-" ? "⁻" : (SUP_DIGITS[Number(d)] ?? d)))
    .join("");
}

/** 展示用单位：把 10 的幂统一成上标写法（×10⁹/L），兼容报告/OCR 的各种变体——
    ×10⁹/L、×10^9/L、x10~9/L、×109/L（上标丢失）都显示成同一个样子；
    其余字符原样保留，仅作展示，不改动存储的原文 */
export function prettyUnit(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  /* 全角数字/斜杠/帽号先摊平（OCR 与某些输入法会打出全角） */
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[＾ˆ]/g, "^").replace(/／/g, "/").replace(/＊/g, "*");
  s = s.replace(/⁻/g, "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUP[c] ?? c);
  /* 「10-9」「x10-9」：减号连接的是负指数，先转成 caret 写法与其他变体合流 */
  s = s.replace(/(^|[xX×*])10\s*-\s*(\d{1,2})(?!\d)/g, "$1" + "10^-$2");
  /* OCR 的 x/* 前缀统一成 ×（只认紧跟 10 的情形，不动单位里其他字符） */
  s = s.replace(/[xX*＊](?=10)/g, "×");
  s = s.replace(
    /×10\s*[~^a]?\s*(-?\d{1,2})(?!\d)/g,
    (_m, k: string) => `×10${supNum(k)}`,
  );
  /* 裸 10 幂（带 ~/^/a 标记的才算数，「109/L」这种上标丢失但无标记的保守不动） */
  s = s.replace(
    /(?<![\dA-Za-z×*])10\s*[~^a]\s*(-?\d{1,2})(?!\d)/g,
    (_m, k: string) => `×10${supNum(k)}`,
  );
  return s;
}

/** 换算倍数文案：k=2 →「乘以 100」、k=-3 →「除以 1000」；|k|>3 写成 10 的幂（如「乘以 10⁵」）。
    k 是数值需要乘的 10 的幂（= 原图单位幂 − 目录单位幂），k>0 数值变大、k<0 变小 */
export function factorLabel(k: number): string {
  const n = Math.abs(k);
  const op = k > 0 ? "乘以" : "除以";
  return n <= 3 ? `${op} ${10 ** n}` : `${op} 10${supNum(n)}`;
}

/** 换算提示整句：说清数值怎么变、以及为什么——原图单位与目录单位差 10^k 倍。
    例：k=2、×10¹¹/L → ×10⁹/L →「数值乘以 100 换算入库（原图 ×10¹¹/L → 目录 ×10⁹/L）」。
    单位先过 prettyUnit，句子里不会出现 x10~9 这类混杂写法 */
export function convertNote(k: number, from: string, to: string): string {
  const f = prettyUnit(from) || "无单位";
  const t = prettyUnit(to) || "无单位";
  return `数值${factorLabel(k)} 换算入库（原图 ${f} → 目录 ${t}）`;
}
