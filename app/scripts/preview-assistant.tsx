// 临时预览脚本：把侧栏底部入口和问助手页面用真实组件渲染成静态 HTML，
// 方便不开浏览器应用就能核对配色与反色。改完样式跑一遍即可。
//
// 用法：npx esbuild scripts/preview-assistant.tsx --bundle --platform=node \
//   --format=esm --jsx=automatic --packages=external --outdir=.preview \
//   --out-extension:.js=.mjs && node .preview/preview-assistant.mjs

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as Storage;

(globalThis as unknown as { matchMedia: (q: string) => { matches: boolean; addEventListener: () => void; removeEventListener: () => void } }).matchMedia = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
});

(globalThis as unknown as { document: { hidden: boolean; addEventListener: () => void; removeEventListener: () => void } }).document = {
  hidden: false,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement: h } = await import("react");
const { MessageCircle, Plus } = await import("lucide-react");
const { Assistant } = await import("../src/workspace/Learning");
const { ScoringCard } = await import("../src/workspace/ScoringCard");

const patient = {
  id: "preview",
  name: "小宇",
  description: "",
  profile: { sex: "男", heightCm: 122, weightKg: 23 },
  benchmarks: {},
  monitors: [
    {
      id: "m1",
      name: "sJIA",
      preset: "sjia",
      metrics: ["temp", "ferritin"],
      active: true,
    },
  ],
  observations: [],
  events: [],
  plans: [],
};

const observation = (metric: string, value: string, at: string) => ({
  id: `${metric}-${at}`,
  group: metric,
  metric,
  value,
  context: "",
  at,
  created: at,
  source: "手录",
  author: "妈妈",
});

const METRIC_NAMES: Record<string, string> = {
  ferritin: "铁蛋白",
  platelet: "血小板",
  ast: "谷草转氨酶 AST",
  tg: "甘油三酯",
  fibrinogen: "纤维蛋白原",
  ldh: "乳酸脱氢酶 LDH",
};
const METRIC_UNITS: Record<string, string> = {
  ferritin: "ng/mL",
  platelet: "×10⁹/L",
  ast: "U/L",
  tg: "mg/dL",
  fibrinogen: "g/L",
  ldh: "U/L",
};

const previewPatient = {
  ...patient,
  observations: [
    observation("ferritin", "500", "2026-10-01T09:00"),
    observation("ferritin", "880", "2026-10-05T09:00"),
    observation("platelet", "240", "2026-10-01T09:00"),
    observation("platelet", "150", "2026-10-05T09:00"),
  ],
  events: [
    { id: "e1", type: "服药", label: "泼尼松 5mg", at: "2026-10-03T08:00" },
    { id: "e2", type: "调药", label: "激素减量", at: "2026-10-06T08:00" },
  ],
};

const { scoreStatic } = await import("../src/engine/staticScoring");
const previewVerdicts = scoreStatic({
  ferritin: 880,
  platelet: 150,
  ast: 22,
  tg: 110,
  fibrinogen: 2.1,
  ldh: 480,
  flags: { feverToday: 39.2, feverStreakHigh: 4, cytopeniaLines: 1, cns: false, bleeding: false, arthritis: true, splenomegaly: false },
});

const navItem = (label: string, active = false) =>
  h("button", { className: active ? "active" : "" }, label);

const sidebar = h(
  "aside",
  { className: "sidebar" },
  h(
    "div",
    { className: "brand" },
    h("span", { className: "brand-icon" }, "暖"),
    h("b", null, "暖少"),
  ),
  h(
    "nav",
    null,
    navItem("首页"),
    navItem("记录", true),
    navItem("学习"),
    h(
      "div",
      { className: "sidebar-primary-row" },
      h(
        "button",
        {
          className: `assistant-entry${process.argv.includes("--active") ? " active" : ""}`,
        },
        h(MessageCircle, { size: 20 }),
        "问助手",
      ),
      h("button", { className: "primary" }, h(Plus, { size: 21 }), "新增记录"),
    ),
  ),
);

const assistant = renderToStaticMarkup(
  h(Assistant, {
    patient: previewPatient as never,
    role: "family",
    alerts: [{ level: "amber", title: "铁蛋白 880 ng/mL，越过观察线" }],
    verdicts: previewVerdicts,
    nameOf: (id: string) => METRIC_NAMES[id] ?? id,
    unitOf: (id: string) => METRIC_UNITS[id] ?? "",
    historyOpen: false,
    onHistoryOpenChange: () => {},
  }),
);

/* ScrollTicker 里有 matchMedia / ResizeObserver，SSR 跑不起来，
   所以把它的最终 DOM 手写一份，只为核对 CSS。
   下面这段和 ScrollTicker.tsx 的 JSX 一一对应。 */
const tickerMarkup = `<div class="scroll-ticker"><span class="scroll-ticker-track" style="animation-duration:8.4s;animation-play-state:running"><span class="scroll-ticker-run">AI 生成仅供参考，请谨遵医嘱</span><span class="scroll-ticker-run" aria-hidden="true">AI 生成仅供参考，请谨遵医嘱</span></span></div>`;

/* 同理，问过一轮之后的 composer 出口（turns.length > 0 才出现）
   在 SSR 里也拿不到，这里按 Learning.tsx 的结构手写一份。 */
const composerMarkup = `<form class="assistant-composer">
  <div class="assistant-composer-bar">
    <button type="button" class="assistant-back">换个问题</button>
  </div>
  <div class="assistant-composer-row">
    <textarea placeholder="描述你想问的情况，或直接点上面的问题"></textarea>
    <button type="submit" class="primary">发送</button>
  </div>
</form>
<div class="assistant-foot">${tickerMarkup}</div>`;

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>样式预览</title>
<link rel="stylesheet" href="/src/index.css">
<link rel="stylesheet" href="/src/workspace/workspace.css">
<style>body{margin:0;background:#f7f9f9}.preview-main{margin-left:210px;padding:24px;max-width:840px}.preview-section{margin-bottom:24px}</style>
</head>
<body><div class="workspace">${renderToStaticMarkup(sidebar)}<div class="preview-main">
  <section class="preview-section">
    ${composerMarkup}
  </section>
  <section class="preview-section">
    ${assistant}
  </section>
  <section class="preview-section">
    ${renderToStaticMarkup(h(ScoringCard, { basis: "每个指标最近一条", snapshot: { ferritin: 820, platelet: 150, ast: 22, tg: 110, fibrinogen: 2.1, ldh: 480, flags: { feverToday: 39.2, feverStreakHigh: 4, cytopeniaLines: 1, cns: false, bleeding: false, arthritis: true, splenomegaly: false } } }))}
  </section>
</div></div></body></html>`;

const { writeFileSync } = await import("node:fs");
writeFileSync("preview.html", html);
console.log("wrote preview.html", html.length, "bytes");
