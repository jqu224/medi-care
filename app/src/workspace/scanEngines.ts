// 扫描解析引擎链：AI 视觉（OpenAI 兼容多模态）→ 本地 PP-OCR → 手动
// 网络与识别器都可通过参数注入，便于测试全 mock
import {
  emptySession,
  extractJson,
  healNarrativeSections,
  normalizeSession,
  sessionFromLines,
  type OcrLine,
  type ScanEngineKind,
  type ScanSession,
} from "./scanSession";

export type VisionConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type VisionTransport = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const defaultTransport: VisionTransport = async (url, init) => {
  const response = await fetch(url, init as RequestInit);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json(),
  };
};

export function visionConfigFromEnv(
  env: Record<string, string | undefined>,
): VisionConfig | null {
  const baseUrl = env.VITE_VISION_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.VITE_VISION_API_KEY?.trim();
  const model = env.VITE_VISION_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

export const PARSE_PROMPT = `你是医疗材料录入助手。先判断照片类型 docType，再按类型提取。只提取真实可见的信息，看不清不要猜。返回严格 JSON，不要 JSON 以外的文字。

docType 只能是其一：lab_table（印刷化验单）| medical_record（门诊病历）| referral（转诊单：情况说明+指标+初步印象+转科，无终诊）| prescription（处方单）| handwritten_temp（手写体温记录单）| clinical_photo（皮疹等临床表现照片）| medication_log（服药打卡/药盒）| other。

通用字段：
{"docType":"…","analysis":"一两句：材料类型、医院、日期、结构","questions":[{"text":"仅歧义时提问，最多3个","options":["选项一","选项二"],"kind":"date 或 choice"}],"reportDate":"YYYY-MM-DD 或空串","hospital":"医院名或空串","items":[],"temps":[],"sections":[]}

lab_table：填 items。items 元素：{"seq":"印刷行号或空","rawName":"中文名","engName":"英文缩写或空","value":"纯数字","unit":"单位","refRange":"报告上的参考区间原文，能见必填","abnormal":"high|low|空"}。双栏化验先左列再右列。value 不带箭头和单位。MPV/PDW 等派生项也要整行提取。sections 必须 []。

medical_record / referral：必须填 sections，禁止返回空数组 []。逐段抄写纸面可见栏目，每项 {"title":"原件栏目名原文","body":"该栏完整正文"}。title 照抄纸面（主诉/入院情况/辅助检查/初步诊断/转往…均可，不要套固定模板）；body 尽量抄全可见文字，只有完全看不清才用空串。叙事不要拆成 items；文内检验另填 items。

handwritten_temp：items 与 sections 必须 []；填 temps，每个时点一行：{"date":"YYYY-MM-DD，只有带圈日号则空并把年月放进 questions","time":"HH:MM","celsius":"纯数字体温","note":"用药备注或空"}。

prescription / clinical_photo / medication_log / other：items、temps、sections 都 []，在 analysis 说明看见了什么。`;

export type FollowUp = { assistantJson: string; userAnswer: string };

export async function visionParse(opts: {
  config: VisionConfig;
  dataUrl: string;
  followUp?: FollowUp[];
  transport?: VisionTransport;
  timeoutMs?: number;
}): Promise<{ session: ScanSession; raw: string }> {
  const transport = opts.transport ?? defaultTransport;
  const content: unknown[] = [
    { type: "text", text: PARSE_PROMPT },
    { type: "image_url", image_url: { url: opts.dataUrl } },
  ];
  const messages: unknown[] = [{ role: "user", content }];
  for (const fu of opts.followUp ?? [])
    messages.push(
      { role: "assistant", content: fu.assistantJson },
      { role: "user", content: fu.userAnswer },
    );
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000)
    : 0;
  let body: unknown;
  try {
    const response = await transport(`${opts.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.config.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.config.model,
        temperature: 0,
        messages,
      }),
      signal: controller?.signal,
    });
    if (!response.ok)
      throw Error(`解析服务返回 ${response.status}`);
    body = await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
  const choices = (body as { choices?: { message?: { content?: unknown } }[] })
    ?.choices;
  const text = choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw Error("解析服务没有返回内容");
  const raw = text;
  return {
    session: healNarrativeSections(normalizeSession(extractJson(text)), raw),
    raw,
  };
}

/* Zion 行为流模式：智谱 key 存在 Zion 项目环境变量里，前端只带 flow ID，
   密钥永不进浏览器。行为流契约：入参 { image: dataUrl, prompt }，返回 JSON 字符串 */
export type ZionFlowConfig = { endpoint: string; flowId: string };

export function zionFlowFromEnv(
  env: Record<string, string | undefined>,
): ZionFlowConfig | null {
  const flowId = env.VITE_ZION_SCAN_FLOW_ID?.trim();
  if (!flowId) return null;
  const endpoint = (
    env.VITE_ZION_API?.trim() ||
    "https://zion-app.functorz.com/zero/DqQnbOV5vvJ/api/graphql-v2"
  ).replace(/\/+$/, "");
  return { endpoint, flowId };
}

export async function zionParse(opts: {
  config: ZionFlowConfig;
  dataUrl: string;
  followUp?: FollowUp[];
  transport?: VisionTransport;
  timeoutMs?: number;
}): Promise<{ session: ScanSession; raw: string }> {
  const clarify = opts.followUp?.map((fu) => fu.userAnswer).join("；");
  const args: Record<string, unknown> = {
    image: opts.dataUrl,
    prompt: clarify ? `${PARSE_PROMPT}\n用户澄清：${clarify}` : PARSE_PROMPT,
  };
  const query =
    "mutation ($args: Json!) { fz_invoke_action_flow(actionFlowId: " +
    JSON.stringify(opts.config.flowId) +
    ", versionId: 1, args: $args) }";
  const transport = opts.transport ?? defaultTransport;
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 90000)
    : 0;
  let body: unknown;
  try {
    const response = await transport(opts.config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { args } }),
      signal: controller?.signal,
    });
    if (!response.ok) throw Error(`行为流请求返回 ${response.status}`);
    body = await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
  const out = (
    body as { data?: { fz_invoke_action_flow?: unknown }; errors?: unknown[] }
  )?.data?.fz_invoke_action_flow;
  if (out == null || out === "")
    throw Error("行为流没有返回内容（检查 flow 是否已发布）");
  const text =
    typeof out === "string"
      ? out
      : typeof (out as { content?: unknown }).content === "string"
        ? (out as { content: string }).content
        : JSON.stringify(out);
  return {
    session: healNarrativeSections(normalizeSession(extractJson(text)), text),
    raw: text,
  };
}

/** 统一 AI 入口：Zion 行为流优先，其次直连多模态接口；都未配置返回 null */
export async function aiParse(opts: {
  env: Record<string, string | undefined>;
  dataUrl: string;
  followUp?: FollowUp[];
  transport?: VisionTransport;
}): Promise<{ session: ScanSession; raw: string } | null> {
  const zion = zionFlowFromEnv(opts.env);
  if (zion)
    return zionParse({
      config: zion,
      dataUrl: opts.dataUrl,
      followUp: opts.followUp,
      transport: opts.transport,
    });
  const direct = visionConfigFromEnv(opts.env);
  if (direct)
    return visionParse({
      config: direct,
      dataUrl: opts.dataUrl,
      followUp: opts.followUp,
      transport: opts.transport,
    });
  return null;
}

export function aiConfigured(env: Record<string, string | undefined>): boolean {
  return !!(zionFlowFromEnv(env) || visionConfigFromEnv(env));
}

export type OcrRecognizer = (dataUrl: string) => Promise<OcrLine[]>;

type PpocrInstance = {
  detect: (src: string) => Promise<{
    texts: { text: string; box?: number[][] }[];
  }>;
};

let ppocrPromise: Promise<PpocrInstance> | null = null;

/** PP-OCRv4 检测+识别两阶段，浏览器端 onnxruntime-web 推理；模型由 scripts/copy-ppocr.mjs
    放到 /ppocr；wasm 加载器由 ORT 按 import.meta.url 相对解析（vite 已排除预构建）。
    detect() 的每行坐标框保留，供上层做区域（表格列）分析 */
export const ppocrRecognizer: OcrRecognizer = async (dataUrl) => {
  if (!ppocrPromise) {
    ppocrPromise = (async () => {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.numThreads = 1;
      const mod = await import("@gutenye/ocr-browser");
      return mod.default.create({
        models: {
          detectionPath: "ppocr/ch_PP-OCRv4_det_infer.onnx",
          recognitionPath: "ppocr/ch_PP-OCRv4_rec_infer.onnx",
          dictionaryPath: "ppocr/ppocr_keys_v1.txt",
        },
      });
    })();
  }
  let ocr: PpocrInstance;
  try {
    ocr = await ppocrPromise;
  } catch (e) {
    ppocrPromise = null; // 失败不缓存，下次重试
    throw e;
  }
  const result = await ocr.detect(dataUrl);
  return result.texts.map((t) => {
    const b = t.box ?? [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const xs = b.map((p) => p[0]);
    const ys = b.map((p) => p[1]);
    return {
      text: t.text,
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    };
  });
};

function brief(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 80 ? msg.slice(0, 80) + "…" : msg;
}

export type ChainOutcome = {
  engine: ScanEngineKind;
  session: ScanSession;
  note: string;
  raw?: string;
};

/** 降级链：配置了 AI（Zion 行为流或直连）先走 AI；失败或未配置走本地 OCR；再失败给手动会话 */
export async function runScanChain(opts: {
  dataUrl: string;
  env: Record<string, string | undefined>;
  transport?: VisionTransport;
  recognizer?: OcrRecognizer;
}): Promise<ChainOutcome> {
  const notes: string[] = [];
  let ai: { session: ScanSession; raw: string } | null = null;
  try {
    ai = await aiParse({
      env: opts.env,
      dataUrl: opts.dataUrl,
      transport: opts.transport,
    });
  } catch (e) {
    notes.push(`AI 识别未成功（${brief(e)}），已切换本地识别`);
  }
  if (ai)
    return {
      engine: "vision",
      session: healNarrativeSections(ai.session, ai.raw),
      note: "",
      raw: ai.raw,
    };
  if (!notes.length) notes.push("未配置 AI 解析服务，本次使用本地识别");
  try {
    const recognize = opts.recognizer ?? ppocrRecognizer;
    const lines = await recognize(opts.dataUrl);
    return { engine: "ocr", session: sessionFromLines(lines), note: notes.join("；") };
  } catch (e) {
    notes.push(`本地识别未成功（${brief(e)}）`);
  }
  return {
    engine: "manual",
    session: emptySession(
      "两次识别都没有成功，照片保留在左侧，请对照原件手动填写，也可以稍后重试",
    ),
    note: notes.join("；"),
  };
}
