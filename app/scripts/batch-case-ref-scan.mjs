/**
 * Batch-run the same scan chain as the app on case-ref photos (OCR unless env has vision).
 * Output: JSON table 扫描记录表 for local audit (reference/, gitignored).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { runScanChain, ppocrRecognizer } from "../src/workspace/scanEngines.ts";
const ROOT = join(import.meta.dirname, "../..");
const ATT = join(
  ROOT,
  "reference/case-ref/上传数据场景_数据表_表格_Attachment",
);
const OUT = join(ROOT, "reference/case-ref/扫描记录表.json");

const FILES = [
  "3a405989e4041dba938c1f4971223017.jpg",
  "eb09edb108d7777c4da223ac141d3219.jpg",
  "476ed806b093921cd8a13a711c27db10.jpg",
  "d705172b004af850eb0e561aae94282c.jpg",
  "cac1b3878d8b6d0ddf6938e1e0a12ed8.jpg",
  "566f72ce8265aad9756d3ec96dcfffe8.jpg",
  "ccfc6b23c4c96d6e95afe3f1a9028b2a.jpg",
];

function toDataUrl(filePath) {
  const buf = readFileSync(filePath);
  const ext = filePath.toLowerCase().endsWith(".png") ? "png" : "jpeg";
  return {
    dataUrl: `data:image/${ext};base64,${buf.toString("base64")}`,
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.length,
  };
}

const env = {};
for (const k of [
  "VITE_ZION_SCAN_FLOW_ID",
  "VITE_ZION_API",
  "VITE_VISION_BASE_URL",
  "VITE_VISION_API_KEY",
  "VITE_VISION_MODEL",
]) {
  if (process.env[k]) env[k] = process.env[k];
}

const rows = [];
for (let i = 0; i < FILES.length; i++) {
  const name = FILES[i];
  const path = join(ATT, name);
  const { dataUrl, sha256, bytes } = await toDataUrl(path);
  const outcome = await runScanChain({
    dataUrl,
    env,
    recognizer: ppocrRecognizer,
  });
  const session = outcome.session;
  rows.push({
    id: `case-ref-${i + 1}`,
    is_active: true,
    source_file: name,
    source_hash_prefix: name.slice(0, 8),
    photo_sha256: sha256,
    prepared_bytes: bytes,
    upload_api: {
      client_photo_store: "IndexedDB nuanshao-photos (putPhoto)",
      ai_parse: env.VITE_ZION_SCAN_FLOW_ID
        ? "GraphQL fz_invoke_action_flow { image: dataUrl, prompt }"
        : env.VITE_VISION_API_KEY
          ? "POST {baseUrl}/chat/completions multimodal"
          : null,
      note: "本批次未配置 .env.local，走本地 PP-OCR",
    },
    engine: outcome.engine,
    engine_note: outcome.note,
    report_date: session.reportDate,
    hospital: session.hospital,
    analysis: session.analysis,
    item_count: session.items.length,
    mapped_item_count: session.items.filter((it) => it.target && it.target !== "__new__")
      .length,
    new_metric_count: session.items.filter((it) => it.target === "__new__").length,
    archive_only_count: session.items.filter((it) => !it.target).length,
    items: session.items.map((it) => ({
      rawName: it.rawName,
      value: it.value,
      unit: it.unit,
      target: it.target,
      abnormal: it.abnormal,
    })),
    questions: session.questions,
  });
  process.stderr.write(`done ${i + 1}/7 ${name} engine=${outcome.engine} items=${session.items.length}\n`);
}

const table = {
  table_name: "扫描记录表",
  generated_at: new Date().toISOString(),
  brand_active: {
    mark_src: "/medi-care-mark.svg",
    wordmark: "MediCare 迈迪克",
    note: "运营中 logo：本地 dev 7101 与体验版静态站均使用该 SVG",
  },
  soft_delete: "使用 is_active=false 标记作废；禁止物理删除行",
  rows,
};

writeFileSync(OUT, `${JSON.stringify(table, null, 2)}\n`, "utf8");
console.log(OUT);
