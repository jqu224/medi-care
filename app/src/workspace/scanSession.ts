// 扫描录入：报告照片 → 解析会话 → 人工确认 → 检测记录
// 纯函数模块；引擎与照片存储见 scanEngines.ts / photoStore.ts；单位换算见 scanUnits.ts
import { uid } from "./model";
import { checkUnit, prettyUnit, scaleDecimal } from "./scanUnits";

export type ScanEngineKind = "vision" | "ocr" | "manual";
export type ScanAbnormal = "" | "high" | "low";

export type ScanItem = {
  id: string;
  rawName: string;
  name: string;
  value: string;
  unit: string;
  refRange: string;
  abnormal: ScanAbnormal;
  /** "" 不录入；指标目录 id；"__new__" 保存时新建自定义指标 */
  target: string;
  /** 报告英文缩写列（PLT/HCT 等），辅助别名匹配 */
  eng?: string;
  /** 原报告印刷的行序号（「序号+英文缩写」列，如 14HCT 里的 14）；没有印刷序号时不设 */
  seq?: string;
  /** 多栏报告里的列号（0 左列 / 1 右列）；单栏报告不设 */
  col?: number;
};

/** 带坐标框的 OCR 行：区域识别的基础数据 */
export type OcrLine = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type ScanQuestion = {
  text: string;
  options: string[];
  kind: "date" | "choice";
};

export type ScanSession = {
  analysis: string;
  questions: ScanQuestion[];
  /** 报告日期 YYYY-MM-DD，无法确定时为空串 */
  reportDate: string;
  hospital: string;
  items: ScanItem[];
};

export type ScanRecord = {
  id: string;
  photoId: string;
  createdAt: string;
  author: string;
  engine: ScanEngineKind;
  session: ScanSession;
  /** 确认后生成的检测批次 group */
  group: string;
  /** 压缩照片的 SHA-256，字节级去重 */
  photoHash?: string;
  /** 16×16 感知哈希（hex），重拍相似去重 */
  photoAhash?: string;
};

export const NEW_METRIC = "__new__";
export const SCAN_SOURCE = "扫描录入·已确认";

/** 两个 hex 指纹的汉明距离（位数） */
export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** 在既有扫描里找同照片：字节级相同优先，感知哈希近距离次之 */
export function findDuplicatePhoto(
  scans: ScanRecord[],
  photoHash: string,
  photoAhash: string,
): { scan: ScanRecord; kind: "exact" | "similar" } | null {
  for (const s of scans)
    if (s.photoHash && s.photoHash === photoHash) return { scan: s, kind: "exact" };
  for (const s of scans)
    if (s.photoAhash && hammingHex(s.photoAhash, photoAhash) <= 10)
      return { scan: s, kind: "similar" };
  return null;
}

/** 内容签名：要录入的「指标=数值」集合，用于报告级去重 */
export function scanSignature(session: ScanSession): string[] {
  return session.items
    .filter((i) => i.target && i.value.trim())
    .map((i) => `${i.target}=${i.value.trim()}`)
    .sort();
}

/** 明细行编号：与原件对照用。
    原报告印刷的行序号（14HCT 的 14）优先；没印序号的行按阅读顺序与已知序号
    连续性回推/前推补全——右列从 14 开始时，左列 13 行自然推回 1–13；
    整份报告都没有印刷序号时按录入顺序 1..N。inferred=true 表示这是推断出的编号 */
export function itemSeqLabels(
  items: { seq?: string }[],
): { label: string; inferred: boolean }[] {
  const n = items.length;
  const known = items.map((it) => {
    const s = (it.seq ?? "").trim();
    return /^\d{1,3}$/.test(s) ? Number(s) : null;
  });
  if (!known.some((v) => v !== null))
    return items.map((_, i) => ({ label: String(i + 1), inferred: true }));
  const nums: number[] = known.map((v) => (v === null ? NaN : v));
  /* 前推：已知序号之后逐项 +1 */
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(nums[i])) prev = nums[i];
    else if (!Number.isNaN(prev)) nums[i] = ++prev;
  }
  /* 回推：已知序号之前逐项 −1（左列未印序号、右列从 14 开始的情形） */
  let next = NaN;
  for (let i = n - 1; i >= 0; i--) {
    if (!Number.isNaN(nums[i])) next = nums[i];
    else if (!Number.isNaN(next)) nums[i] = --next;
  }
  return nums.map((v, i) =>
    !Number.isNaN(v) && v >= 1
      ? { label: String(v), inferred: known[i] === null }
      : { label: String(i + 1), inferred: true },
  );
}

/** 报告级相似：同报告日期、条数相差 ≤2 且较小一方的签名基本被另一方包含，视为疑似重复 */
export function isSimilarScan(a: ScanSession, b: ScanSession): boolean {
  if (!a.reportDate || a.reportDate !== b.reportDate) return false;
  const sa = scanSignature(a);
  const sb = scanSignature(b);
  if (!sa.length || !sb.length) return false;
  if (Math.abs(sa.length - sb.length) > 2) return false;
  const setB = new Set(sb);
  const overlap = sa.filter((x) => setB.has(x)).length;
  return overlap / Math.min(sa.length, sb.length) >= 0.8;
}

/* 检验报告项目名 → 指标目录 id。中文按包含匹配，拉丁缩写按全等匹配。 */
const ALIAS_CONTAINS: [string, string][] = [
  ["体温", "temp"],
  ["腋温", "temp"],
  ["口温", "temp"],
  ["耳温", "temp"],
  ["铁蛋白", "ferritin"],
  ["血小板", "platelet"],
  ["纤维蛋白原", "fibrinogen"],
  ["谷草转氨酶", "ast"],
  ["天门冬氨酸氨基转移酶", "ast"],
  ["天冬氨酸氨基转移酶", "ast"],
  ["甘油三酯", "tg"],
  ["甘油三脂", "tg"],
  ["三酰甘油", "tg"],
  ["乳酸脱氢酶", "ldh"],
  ["血糖", "glucose"],
  ["葡萄糖", "glucose"],
  ["糖化血红蛋白", "a1c"],
  ["糖化血色素", "a1c"],
  ["心率", "hr"],
  ["脉搏", "hr"],
  ["体重", "weight"],
];
const ALIAS_EXACT: [string, string][] = [
  ["plt", "platelet"],
  ["ast", "ast"],
  ["ferritin", "ferritin"],
  ["ldh", "ldh"],
  ["hba1c", "a1c"],
];
/** 这些是派生统计项或相邻检测，不能映射到同名主指标 */
const ALIAS_EXCLUDE = [
  "压积",
  "分布宽度",
  "平均血小板",
  "比容",
  "大血小板比率",
  "降解产物",
  "同工酶",
  "mpv",
  "pdw",
  "pct",
  "fdp",
  "p-lcr",
];

function normName(s: string) {
  return s.trim().toLowerCase().replace(/[\s:：·,，。]/g, "");
}

export function matchMetricAlias(rawName: string): string {
  const name = normName(rawName);
  if (!name || name.length > 30) return "";
  if (ALIAS_EXCLUDE.some((x) => name.includes(x))) return "";
  const exact = ALIAS_EXACT.find(([k]) => name === k);
  if (exact) return exact[1];
  const hit = ALIAS_CONTAINS.find(([k]) => name.includes(normName(k)));
  return hit ? hit[1] : "";
}

/* 报告英文缩写列（PLT/HCT…）→ 指标目录；只认全等；报告里缩写常带行序号（"20PLT"），剥掉再匹配 */
const ENG_ALIAS: Record<string, string> = Object.fromEntries(
  ALIAS_EXACT.map(([k, v]) => [k.toUpperCase(), v]),
);
/** 剥掉英文缩写前的 1–2 位行序号（"20PLT"→"PLT"），保留纯缩写原样 */
export function cleanEng(raw: string): string {
  return (raw ?? "").trim().replace(/^\d{1,2}(?=[A-Za-z])/, "");
}
export function matchEngAlias(eng: string): string {
  const raw = (eng ?? "").trim().toUpperCase();
  if (!raw) return "";
  return ENG_ALIAS[raw] ?? ENG_ALIAS[cleanEng(raw).toUpperCase()] ?? "";
}

/** 剥掉序号列的装饰（"14."、"第14项"、"No.14" → "14"）；认不出或超过 3 位返回空串 */
export function cleanSeq(raw: string): string {
  const m = (raw ?? "").trim().match(/^[第No#.\s]*?(\d{1,3})(?!\d)/i);
  return m ? String(Number(m[1])) : "";
}

export function normalizeDate(raw: string): string {
  const m = raw
    .trim()
    .match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function extractReportDate(text: string): string {
  const m = text.match(
    /(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/,
  );
  return m ? normalizeDate(m.slice(1).join("-").replace(/[-/.]/g, "-")) : "";
}

export type RawScanItem = {
  rawName: string;
  value: string;
  unit?: string;
  refRange?: string;
  abnormal?: string;
  seq?: string;
  /** 双列报告并排时来自左列（0）/右列（1）；单列报告不设 */
  col?: number;
};

/** OCR 常把汉字间的空格当字符输出（血清 铁 蛋 白），展示与匹配前先合并 */
function cleanName(name: string) {
  return name
    .replace(/(?<=[\u4e00-\u9fa5])[ \t]+(?=[\u4e00-\u9fa5])/g, "")
    .replace(/^[%＋+*＊·]+/, "");
}

/** 合法检验单位：拉丁字母系（ng/mL、U/L、10^9/L）加 %、℃、mmHg；单字符与纯数字不是单位 */
function looksLikeUnit(token: string) {
  if (token === "%" || token === "℃" || token === "mmHg") return true;
  if (token.length < 2 || token.length > 12) return false;
  /* 允许 ×/~/‰/μ 与上标（×10⁹/L、x10~9/L）；不含冒号等区间残渣字符 */
  if (!/^[A-Za-z0-9^/%·.×~‰μµ⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+$/.test(token)) return false;
  return /[A-Za-z]/.test(token) || /^10\^?\d/.test(token);
}

/** OCR 常把 ↑/↓ 认成形近字（个、4、t），紧贴数值的第一个 token 不可信，
    从剩余文本里挑第一个合法单位 */
function pickUnit(rest: string) {
  for (const raw of rest.split(/[\s↑↓、,，;；]+/)) {
    const token = raw.replace(/^[（(]+|[）)]+$/g, "");
    /* 数字后缀的百分号（1%）是排版噪音，按百分比单位处理 */
    if (token.endsWith("%") && /^[A-Za-z0-9.]+$/.test(token.slice(0, -1)))
      return "%";
    if (looksLikeUnit(token)) return token;
  }
  return "";
}

/** 参考区间：优先括号内（24-336），否则行尾裸区间（181-452）；箭头丢失时靠它推导高低向 */
function pickRange(rest: string) {
  const paren = rest.match(
    /[（(]\s*(\d+(?:\.\d+)?)\s*[-~–至]\s*(\d+(?:\.\d+)?)\s*[）)]/,
  );
  const bare = rest.match(
    /(\d+(?:\.\d+)?)\s*[-~–至]\s*(\d+(?:\.\d+)?)\s*$/,
  );
  const m = paren ?? bare;
  if (!m) return null;
  const low = Number(m[1]);
  const high = Number(m[2]);
  if (!(low < high) || high > 1e6) return null;
  return { low, high, text: `${m[1]}-${m[2]}` };
}

/** OCR 文本行 → 「项目名 数值 单位」候选；不做别名过滤，交给调用方决定。
    双列报告一行会并进左右两列内容，在「参考区间 + 编号拉丁名」（3.50-9.50 14HCT）处拆开 */
export function parseOcrLines(text: string): RawScanItem[] {
  const out: RawScanItem[] = [];
  const seen = new Set<string>();
  const lines: { text: string; col?: number }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const pieces = rawLine
      .trim()
      .replace(
        /(\d+(?:\.\d+)?\s*[-~–]\s*\d+(?:\.\d+)?)\s+(?=\d{1,2}[A-Z])/g,
        "$1\u0001",
      )
      .split("\u0001");
    /* 恰好两片 = 双列报告并排的左右两列，带列号；更多片放弃列号 */
    if (pieces.length === 2) {
      lines.push({ text: pieces[0], col: 0 }, { text: pieces[1], col: 1 });
    } else {
      for (const piece of pieces) lines.push({ text: piece });
    }
  }
  for (const { text: source, col } of lines) {
    /* 行首印刷序号先摘出来：右列的「序号+英文缩写」（20PLT）或单列的「14 项目名」；
       其余前导符号（星号、百分号）是报告排版噪音 */
    let seq = "";
    let text = source.trim();
    const glued = text.match(/^(\d{1,2})[A-Za-z][A-Za-z-]*\s*/);
    if (glued) {
      seq = glued[1];
      text = text.slice(glued[0].length);
    } else {
      const lead = text.match(/^(\d{1,2})[\s.、]+(?=[\u4e00-\u9fa5A-Za-z*＊])/);
      if (lead) {
        seq = lead[1];
        text = text.slice(lead[0].length);
      }
    }
    const line = text
      .replace(/[*＊]/g, "")
      .replace(/^[%%]+\s*/, "")
      .trim();
    if (!line || line.length > 80) continue;
    const num = line.match(/\d+(?:\.\d+)?/);
    if (!num || num.index === undefined) continue;
    const after = line[num.index + num[0].length];
    if (["-", "/", ":", "年"].includes(after ?? "")) continue;
    const name = cleanName(
      line.slice(0, num.index).replace(/[\s:：.·<≤>≥]+$/, ""),
    );
    if (!name || !/[\u4e00-\u9fa5a-z]/i.test(name)) continue;
    if (/时间|日期|生日|编号|电话|标本|床号|第.{0,2}页|共.{1,3}页|审核|检验者|打印|样本/.test(name))
      continue;
    const rest = line.slice(num.index + num[0].length).trim();
    const range = pickRange(rest);
    const value = Number(num[0]);
    let abnormal: ScanAbnormal = "";
    if (line.includes("↑")) abnormal = "high";
    else if (line.includes("↓")) abnormal = "low";
    else if (range && Number.isFinite(value)) {
      if (value < range.low) abnormal = "low";
      else if (value > range.high) abnormal = "high";
    }
    const key = name + "|" + num[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rawName: name,
      value: num[0],
      unit: pickUnit(rest),
      refRange: range?.text ?? "",
      abnormal,
      ...(seq ? { seq } : {}),
      ...(col !== undefined ? { col } : {}),
    });
  }
  return out;
}

/* ===== 区域识别：表头锚定列 → 左右分组 → 列内 token 分配，表外行只提日期 ===== */

const NAME_KEYS = ["中文名称", "项目名称", "检验项目", "项目", "名称"];
const VALUE_KEYS = ["结果", "测定值", "检测结果"];
const UNIT_KEYS = ["单位"];
const REF_KEYS = ["参考范围", "参考区间", "参考值"];
const ENG_KEYS = ["英文名称", "英文缩写", "英文", "缩写"];

function isCJK(ch: string) {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF↑↓]/.test(ch);
}

/** OCR 行是整行一个框：按字符占比估算 token 的 x 位置（中文全宽、拉丁约半宽） */
function estX(line: OcrLine, charStart: number, charEnd: number): number {
  let prefix = 0;
  let total = 0;
  for (let i = 0; i < line.text.length; i++) {
    const w = isCJK(line.text[i]) ? 1 : 0.55;
    total += w;
    if (i < charStart) prefix += w;
    else if (i < charEnd) prefix += w / 2;
  }
  return line.x0 + (total ? prefix / total : 0) * (line.x1 - line.x0);
}

type Anchor = { key: "name" | "value" | "unit" | "ref" | "eng"; x: number };
type ColumnGroup = { name: number; left: number; right: number };

function collectAnchors(line: OcrLine): Anchor[] {
  const specs: [Anchor["key"], string[]][] = [
    ["name", NAME_KEYS],
    ["value", VALUE_KEYS],
    ["unit", UNIT_KEYS],
    ["ref", REF_KEYS],
    ["eng", ENG_KEYS],
  ];
  const out: Anchor[] = [];
  for (const [key, words] of specs) {
    for (const w of words) {
      let idx = line.text.indexOf(w);
      while (idx >= 0) {
        const x = estX(line, idx, idx + w.length);
        /* 重叠关键词（“中文名称”含“名称”）会打出近似锚点，去重 */
        if (!out.some((a) => a.key === key && Math.abs(a.x - x) < 24))
          out.push({ key, x });
        idx = line.text.indexOf(w, idx + w.length);
      }
    }
  }
  return out;
}

function isHeaderLine(text: string): boolean {
  const hasName = NAME_KEYS.some((k) => text.includes(k));
  const hasValue = VALUE_KEYS.some((k) => text.includes(k));
  const hasCol = UNIT_KEYS.some((k) => text.includes(k)) || REF_KEYS.some((k) => text.includes(k));
  return hasName && hasValue && hasCol;
}

/** 表头行 → 1–2 组列锚点。每个非名称锚点只归属 x 距离最近的名称组：
    d705 里「序号+英文缩写」列紧贴右组，因此英文只属于右组，左组行不该挂缩写 */
function columnsFromAnchors(anchors: Anchor[], header: OcrLine): ColumnGroup[] {
  const names = anchors.filter((a) => a.key === "name").sort((a, b) => a.x - b.x);
  if (!names.length) return [];
  const width = header.x1 - header.x0;
  const seed: { name: number; xs: number[] }[] = [];
  for (const n of names) {
    if (seed.length && n.x - seed[seed.length - 1].name < width * 0.25) continue;
    seed.push({ name: n.x, xs: [n.x] });
  }
  for (const a of anchors) {
    if (a.key === "name") continue;
    let bi = 0;
    let bd = Infinity;
    seed.forEach((g, i) => {
      const d = Math.abs(a.x - g.name);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    seed[bi].xs.push(a.x);
  }
  return seed.map((g) => ({
    name: g.name,
    left: Math.min(...g.xs),
    right: Math.max(...g.xs),
  }));
}

type Token = { text: string; x: number };

function tokenize(line: OcrLine): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text)))
    out.push({ text: m[0], x: estX(line, m.index, m.index + m[0].length) });
  return out;
}

const isNumTok = (t: string) => /^[<≤>≥]?\d+(?:\.\d+)?$/.test(t);
const isRangeTok = (t: string) => /^\d+(?:\.\d+)?[-~–至]\d+(?:\.\d+)?$/.test(t);
const isEngTok = (t: string) => /^\d{0,2}[A-Za-z][A-Za-z-]+$/.test(t) && !/^[a-z]$/.test(t);

/** 组内按类型顺序解析：中文名打头 → 数值 → 单位 → 参考区间 → 英文缩写。
    类型规则比精确列坐标更抗拉丁/中文宽度差异带来的漂移。
    真实报告里 OCR 常把数值和名字粘在一起（「平均红细胞血红蛋白浓356」），
    组里没有独立数值 token 时，把名字尾部的数字拆出来当数值 */
function classifyTokens(tokens: Token[]) {
  const name: string[] = [];
  let value = "";
  let unit = "";
  let ref = "";
  let eng = "";
  let seq = "";
  const leftovers: Token[] = [];
  let sawNumber = false;
  const hasStandaloneNum = tokens.some((t) => isNumTok(t.text));
  /* 行首「序号 英文缩写」（14 HCT）或「序号 中文名」（14 红细胞压积）：
     1–2 位整数紧跟缩写/中文名、且组里还有其他数字（真正的结果值），才认作序号 */
  let start = 0;
  const headSeq = tokens[0]?.text.match(/^(\d{1,2})$/)?.[1];
  if (
    headSeq &&
    tokens.length > 1 &&
    (isEngTok(tokens[1].text) || /^[*＊]?[\u4e00-\u9fa5]/.test(tokens[1].text)) &&
    tokens.slice(1).some((t) => isNumTok(t.text) || isRangeTok(t.text))
  ) {
    seq = headSeq;
    start = 1;
  }
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (!eng && isEngTok(t.text)) {
      /* 「序号+英文缩写」粘连列（14HCT）：序号只在组首 token 上可信 */
      if (i === 0 && !seq) {
        const m = t.text.match(/^(\d{1,2})(?=[A-Za-z])/);
        if (m) seq = m[1];
      }
      eng = t.text;
      continue;
    }
    if (!ref && isRangeTok(t.text)) {
      ref = t.text;
      continue;
    }
    if (!sawNumber && isNumTok(t.text)) {
      value = t.text.replace(/^[<≤>≥]+/, "");
      sawNumber = true;
      continue;
    }
    if (!sawNumber) {
      if (!hasStandaloneNum) {
        const glued = t.text.match(/^(.+?[^\d.])(\d+(?:\.\d+)?)$/);
        if (glued && /[\u4e00-\u9fa5A-Za-z]/.test(glued[1])) {
          name.push(glued[1]);
          value = glued[2];
          sawNumber = true;
          continue;
        }
      }
      name.push(t.text);
      continue;
    }
    if (!unit && !ref) {
      const clean = t.text.replace(/[↑↓]/g, "");
      /* 「+%」「1%」：前缀是符号或数字的百分号都是排版噪音，单位取 % */
      if (/%$/.test(clean) && !/[A-Za-z]/.test(clean.slice(0, -1))) unit = "%";
      else if (looksLikeUnit(clean)) unit = clean.slice(0, 12);
      else leftovers.push(t);
      continue;
    }
    leftovers.push(t);
  }
  return { name: name.join(""), value, unit, ref, eng, seq, leftovers };
}

function groupScore(ts: Token[]): number {
  if (!ts.length) return 0;
  const c = classifyTokens(ts);
  if (!c.value) return -12;
  let s = 4;
  if (c.name) s += 2;
  if (c.eng) s += 1;
  if (c.unit) s += 1;
  if (c.ref) s += 1;
  if (!c.name && c.eng) s -= 1;
  s -= c.leftovers.length * 2;
  return s;
}

/** 表头给出的左右分界（左组最右锚点与右组最左锚点的中点） */
function expectedBoundary(groups: ColumnGroup[]): number | null {
  if (groups.length < 2) return null;
  return (groups[0].right + groups[1].left) / 2;
}

/** 单片段行归属哪列：片段水平中点与分界比较 */
function columnOf(tokens: Token[], expected: number | null): number {
  if (expected === null || !tokens.length) return 0;
  const mid = (tokens[0].x + tokens[tokens.length - 1].x) / 2;
  return mid >= expected ? 1 : 0;
}

/** 行 token → 1–2 组：枚举拆分点按「两段都解释得通」打分，几何位置只做同分时的裁决，
    避免 estX 估算误差把「14HCT」这类边界 token 划错组；
    「序号+英文缩写」列领起右组（14HCT *红细胞压积），右段以英文开头时给偏好 */
function splitRow(tokens: Token[], expected: number | null): Token[][] {
  if (tokens.length < 2 || expected === null) return [tokens];
  const n = tokens.length;
  let best: { k: number; score: number } | null = null;
  /* 「序号 英文缩写」领起右组（14 HCT）：拆分点落在序号上的裸数字是合法的 */
  const seqLeadAt = (k: number) =>
    k < n &&
    /^\d{1,2}$/.test(tokens[k].text) &&
    k + 1 < n &&
    isEngTok(tokens[k + 1].text);
  for (let k = 1; k <= n; k++) {
    if (k < n) {
      const next = tokens[k].text;
      if ((isNumTok(next) || isRangeTok(next)) && !seqLeadAt(k)) continue; // 组不以裸数字开头
    }
    let score = groupScore(tokens.slice(0, k)) + groupScore(tokens.slice(k));
    if (k < n) {
      const bx = (tokens[k - 1].x + tokens[k].x) / 2;
      score -= Math.min(4, Math.abs(bx - expected) / 40);
      if (isEngTok(tokens[k].text) || seqLeadAt(k)) score += 3; // 英文缩写领起右组（序号+缩写是右组首列）
    }
    if (!best || score > best.score) best = { k, score };
  }
  const k = best ? best.k : n;
  return [tokens.slice(0, k), tokens.slice(k)];
}

/** 版面分析：找到表头与列结构后，表区行按列取值；表外行（页眉页脚）单独返回 */
export function sessionFromLines(lines: OcrLine[]): ScanSession {
  const header = lines.find((l) => isHeaderLine(l.text));
  if (!header) {
    const fallback = sessionFromOcr(lines.map((l) => l.text).join("\n"));
    fallback.analysis = fallback.analysis.replace("本地识别", "无表头，按行识别");
    return fallback;
  }
  const groups = columnsFromAnchors(collectAnchors(header), header);
  const below = lines.filter(
    (l) => l !== header && l.y0 >= header.y1 - 4,
  );
  const expected = expectedBoundary(groups);
  /* 先把每行拆成「左列片段/右列片段」并带列号；单片段行按其中点 x 归属列 */
  const rowEntries: { parts: { tokens: Token[]; col: number }[] }[] = [];
  const outside: OcrLine[] = [];
  for (const line of below) {
    const split = splitRow(tokenize(line), expected);
    const parts =
      split.length > 1
        ? split.map((tokens, i) => ({ tokens, col: i }))
        : [{ tokens: split[0], col: columnOf(split[0], expected) }];
    if (parts.some((p) => /\d/.test(classifyTokens(p.tokens).value)))
      rowEntries.push({ parts });
    else outside.push(line);
  }
  const above = lines.filter((l) => l !== header && l.y0 < header.y1 - 4);
  const items: ScanItem[] = [];
  let matched = 0;
  let auto = 0;
  /* 区域切分阅读顺序：先自上而下读完左列，再读右列——
    与人工按「左边一大列、右边一大列」核对原件的顺序一致，而不是逐行左右穿插 */
  for (let col = 0; col < Math.max(1, groups.length); col++) {
    for (const { parts } of rowEntries) {
      const hit = parts.find((p) => p.col === col);
      if (!hit) continue;
      const part = hit.tokens;
      const g = classifyTokens(part);
      const num = g.value.match(/\d+(?:\.\d+)?/);
      if (!num) continue;
      const rawName = cleanName(g.name.replace(/[*＊]/g, ""));
      if (!rawName || !/[\u4e00-\u9fa5A-Za-z]/.test(rawName)) continue;
      const range = pickRange(g.ref);
      const value = Number(num[0]);
      /* 箭头按「组」判定：双列行里左组的 ↓ 不能波及右组 */
      const hasUp = part.some((t) => t.text.includes("↑"));
      const hasDown = part.some((t) => t.text.includes("↓"));
      let abnormal: ScanAbnormal = "";
      if (hasUp) abnormal = "high";
      else if (hasDown) abnormal = "low";
      else if (range) {
        if (value < range.low) abnormal = "low";
        else if (value > range.high) abnormal = "high";
      }
      const eng = cleanEng(g.eng);
      const aliasHit = matchMetricAlias(rawName) || matchEngAlias(eng);
      const target = aliasHit || defaultTarget(rawName, g.unit, g.ref, abnormal);
      if (aliasHit) matched++;
      else if (target === NEW_METRIC) auto++;
      items.push({
        id: uid(),
        rawName,
        name: rawName,
        value: num[0],
        unit: g.unit,
        refRange: range?.text ?? g.ref.slice(0, 20),
        abnormal,
        target,
        ...(eng ? { eng } : {}),
        ...(g.seq ? { seq: g.seq } : {}),
        ...(groups.length > 1 ? { col } : {}),
      });
    }
  }
  const dateText = [...above, ...outside].map((l) => l.text).join("\n");
  const session = emptySession(
    items.length
      ? `表格解析：${items.length} 行检验项目${groups.length > 1 ? "（左右两组列并排，已按左列→右列顺序排好）" : ""}，${matched} 项匹配指标目录，${auto} 项将新建自定义指标；页眉页脚（日期/页码/签名）已排除`
      : "表格里没有读到可录入的检验数值，请对照原件手动填写",
  );
  session.reportDate =
    extractReportDate(dateText) || extractReportDate(lines.map((l) => l.text).join("\n"));
  session.items = items;
  return session;
}

export function emptySession(analysis = ""): ScanSession {  return {
    analysis,
    questions: [],
    reportDate: "",
    hospital: "",
    items: [],
  };
}

function toStringOrEmpty(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** 录入目标默认值：匹配目录用目录项；没匹配但有单位/参考区间/箭头的
    视为真实检验项目，默认新建自定义指标（未知的指标不能悄悄丢掉）；
    什么信号都没有的行当噪音，默认仅存档 */
export function defaultTarget(
  rawName: string,
  unit: string,
  refRange: string,
  abnormal: string,
): string {
  const hit = matchMetricAlias(rawName);
  if (hit) return hit;
  if (unit || refRange || abnormal) return NEW_METRIC;
  return "";
}

/** AI 返回的任意 JSON → 受控 ScanSession；无法识别的字段一律丢弃 */
export function normalizeSession(raw: unknown): ScanSession {
  const s = (raw ?? {}) as Record<string, unknown>;
  const questions: ScanQuestion[] = Array.isArray(s.questions)
    ? s.questions.slice(0, 3).map((q) => {
        const o = (q ?? {}) as Record<string, unknown>;
        return {
          text: toStringOrEmpty(o.text, 120),
          options: Array.isArray(o.options)
            ? o.options.map((x) => toStringOrEmpty(x, 40)).filter(Boolean).slice(0, 4)
            : [],
          kind: o.kind === "date" ? ("date" as const) : ("choice" as const),
        };
      })
    : [];
  const items: ScanItem[] = Array.isArray(s.items)
    ? s.items.slice(0, 40).map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        const rawName = toStringOrEmpty(o.rawName ?? o.name ?? o.item, 30);
        const value = toStringOrEmpty(o.value, 12);
        const unit = toStringOrEmpty(o.unit, 12);
        const refRange = toStringOrEmpty(o.refRange ?? o.reference, 20);
        const abnormal: ScanAbnormal =
          o.abnormal === "high"
            ? "high"
            : o.abnormal === "low"
              ? "low"
              : "";
        const target = defaultTarget(rawName, unit, refRange, abnormal);
        const eng = cleanEng(toStringOrEmpty(o.engName ?? o.eng, 10));
        const seq = cleanSeq(toStringOrEmpty(o.seq ?? o.序号, 8));
        return {
          id: uid(),
          rawName,
          name: rawName,
          value,
          unit,
          refRange,
          abnormal,
          ...(eng ? { eng } : {}),
          ...(seq ? { seq } : {}),
          target: matchMetricAlias(rawName) || matchEngAlias(eng) || target,
        };
      })
      .filter((i) => i.rawName && i.value)
    : [];
  return {
    analysis: toStringOrEmpty(s.analysis, 240),
    questions: questions.filter((q) => q.text && q.options.length),
    reportDate: normalizeDate(toStringOrEmpty(s.reportDate, 24)),
    hospital: toStringOrEmpty(s.hospital, 40),
    items,
  };
}

export function sessionFromOcr(text: string): ScanSession {
  const rows = parseOcrLines(text);
  const matched = rows.filter((r) => matchMetricAlias(r.rawName));
  const auto = rows.filter(
    (r) => !matchMetricAlias(r.rawName) && (r.unit || r.refRange || r.abnormal),
  );
  const session = emptySession(
    rows.length
      ? `本地识别到 ${rows.length} 行数据：${matched.length} 项匹配指标目录，${auto.length} 项将新建自定义指标；不需要的行可改为不录入`
      : "本地识别没有读到有效的检验数值，请对照原件手动填写",
  );
  session.reportDate = extractReportDate(text);
  session.items = rows.map((r) => ({
    id: uid(),
    rawName: r.rawName,
    name: r.rawName,
    value: r.value,
    unit: r.unit ?? "",
    refRange: r.refRange ?? "",
    abnormal: (r.abnormal as ScanAbnormal) ?? "",
    target: defaultTarget(
      r.rawName,
      r.unit ?? "",
      r.refRange ?? "",
      r.abnormal ?? "",
    ),
    ...(r.seq ? { seq: r.seq } : {}),
    ...(r.col !== undefined ? { col: r.col } : {}),
  }));
  return session;
}

export type ScanUnitNote = {
  kind: "same" | "convert" | "unknown";
  k?: number;
  from: string;
  to: string;
};

export type ScanRowDraft = {
  /** 对应 session.items 里的行 id，保存后回写实际指标 id 用 */
  itemId: string;
  metric: string;
  value: string;
  custom?: { name: string; unit: string };
  unitNote?: ScanUnitNote;
  /** 目录指标没有单位而报告有：保存时用报告单位回填目录 */
  fillUnit?: string;
};

export type ScanCatalogLookup = (id: string) => { name: string; unit: string } | undefined;

/** 确认保存前的校验与展开：跳过未勾选/空值行，数值必须是非负数字；
    选到现有指标时对照目录单位——可换算的按 10^k 换算后入库，
    维度不同（incompatible）的行列入 blocked 阻断保存 */
export function sessionToRows(
  session: ScanSession,
  lookup?: ScanCatalogLookup,
): { rows: ScanRowDraft[]; error: string; blocked: string[] } {
  const rows: ScanRowDraft[] = [];
  const bad: string[] = [];
  const blocked: string[] = [];
  for (const item of session.items) {
    if (!item.target) continue;
    const value = item.value.trim();
    if (!value) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      bad.push(item.rawName || item.name);
      continue;
    }
    if (item.target === NEW_METRIC) {
      rows.push({
        itemId: item.id,
        metric: "",
        value,
        /* 新指标的单位入目录前先统一成上标写法（x10~9/L、×10^9/L → ×10⁹/L） */
        custom: { name: item.name || item.rawName, unit: prettyUnit(item.unit) },
      });
      continue;
    }
    const meta = lookup?.(item.target);
    let outValue = value;
    let unitNote: ScanUnitNote | undefined;
    let fillUnit: string | undefined;
    if (meta) {
      const check = checkUnit(item.unit, meta.unit);
      if (check.kind === "incompatible") {
        blocked.push(
          `${item.rawName || item.name}（${prettyUnit(item.unit) || "无单位"} → ${prettyUnit(meta.unit) || "无单位"}）`,
        );
        continue;
      }
      if (check.kind === "convert" && check.k !== undefined) {
        outValue = scaleDecimal(value, check.k);
        unitNote = { kind: "convert", k: check.k, from: item.unit, to: meta.unit };
      } else if (check.kind === "same") {
        unitNote = { kind: "same", from: item.unit, to: meta.unit };
      } else {
        unitNote = { kind: "unknown", from: item.unit, to: meta.unit };
        /* 目录单位留空、报告有单位：保存时回填（老自定义指标常见） */
        if (!meta.unit.trim() && item.unit.trim()) fillUnit = prettyUnit(item.unit);
      }
    }
    rows.push({
      itemId: item.id,
      metric: item.target,
      value: outValue,
      ...(unitNote ? { unitNote } : {}),
      ...(fillUnit ? { fillUnit } : {}),
    });
  }
  return {
    rows,
    error: bad.length ? `以下项目的数值无效，请修正后再保存：${bad.join("、")}` : "",
    blocked,
  };
}

/** 从 AI 文本里抠出 JSON（容忍 ```json 围栏与前后闲话） */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw Error("响应里没有 JSON");
  return JSON.parse(stripped.slice(start, end + 1));
}
