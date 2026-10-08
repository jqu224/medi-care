// Zion image upload + scan_record insert (operating backend PO76RBe9QQV).
// Flow: MD5 → presignedImageListV2 → PUT exact uploadHeaders → insert_scan_record_one(photo_id).

import { md5Base64 } from "./md5";
import type { ScanEngineKind, ScanSession } from "./scanSession";

export type ZionMediaConfig = { endpoint: string };

/** Data API for scan_record / images. Prefer operating backend over open-source. */
export function zionMediaFromEnv(
  env: Record<string, string | undefined>,
): ZionMediaConfig | null {
  if (env.VITE_ZION_UPLOAD === "0") return null;
  const endpoint = (
    env.VITE_ZION_DATA_API?.trim() ||
    env.VITE_ZION_API?.trim() ||
    "https://zion-app.functorz.com/zero/PO76RBe9QQV/api/graphql-v2"
  ).replace(/\/+$/, "");
  return { endpoint };
}

export type MediaFormat = "JPEG" | "PNG" | "WEBP" | "GIF";

export function mediaFormatOf(mime: string): MediaFormat {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "PNG";
  if (m.includes("webp")) return "WEBP";
  if (m.includes("gif")) return "GIF";
  return "JPEG";
}

type Presign = {
  imageId: number;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  contentType: string;
  downloadUrl: string;
};

async function gql<T>(
  endpoint: string,
  query: string,
  transport: typeof fetch = fetch,
): Promise<T> {
  const response = await transport(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw Error(`Zion 返回 ${response.status}`);
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length)
    throw Error(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw Error("Zion 没有返回数据");
  return body.data;
}

/** Upload raw bytes; returns Zion image id. Headers must be exact (OSS signature). */
export async function uploadImageToZion(opts: {
  config: ZionMediaConfig;
  blob: Blob;
  format?: MediaFormat;
  transport?: typeof fetch;
}): Promise<{ imageId: number; downloadUrl: string }> {
  const transport = opts.transport ?? fetch;
  const format = opts.format ?? mediaFormatOf(opts.blob.type || "image/jpeg");
  const md5 = await md5Base64(opts.blob);
  const data = await gql<{
    presignedImageListV2: Presign[];
  }>(
    opts.config.endpoint,
    `query { presignedImageListV2(inputs: [{imgMd5Base64: ${JSON.stringify(md5)}, imageSuffix: ${format}}]) { imageId uploadUrl uploadHeaders contentType downloadUrl } }`,
    transport,
  );
  const p = data.presignedImageListV2?.[0];
  if (!p?.uploadUrl || !p.imageId) throw Error("Zion 预签名失败");
  const put = await transport(p.uploadUrl, {
    method: "PUT",
    headers: p.uploadHeaders,
    body: opts.blob,
  });
  if (!put.ok) throw Error(`图片上传失败（${put.status}）`);
  return { imageId: p.imageId, downloadUrl: p.downloadUrl };
}

export type ZionScanPush = {
  recordId: number;
  imageId: number;
  downloadUrl: string;
};

export async function pushScanToZion(opts: {
  config: ZionMediaConfig;
  blob: Blob;
  mime?: string;
  sourceFile?: string;
  engine: ScanEngineKind;
  session: ScanSession;
  pipeline?: string;
  transport?: typeof fetch;
}): Promise<ZionScanPush> {
  const { imageId, downloadUrl } = await uploadImageToZion({
    config: opts.config,
    blob: opts.blob,
    format: mediaFormatOf(opts.mime || opts.blob.type || "image/jpeg"),
    transport: opts.transport,
  });
  const s = opts.session;
  const result = {
    docType: s.docType,
    analysis: s.analysis,
    reportDate: s.reportDate,
    hospital: s.hospital,
    sections: s.sections,
    items: s.items.map((i) => ({
      rawName: i.rawName,
      engName: i.eng,
      value: i.value,
      unit: i.unit,
      refRange: i.refRange,
      abnormal: i.abnormal,
      target: i.target,
    })),
    temps: s.temps,
  };
  const fields = [
    `is_active: true`,
    `photo_id: ${imageId}`,
    `engine: ${JSON.stringify(opts.engine)}`,
    `doc_type: ${JSON.stringify(s.docType || "")}`,
    `pipeline: ${JSON.stringify(opts.pipeline ?? "")}`,
    `analysis: ${JSON.stringify((s.analysis || "").slice(0, 500))}`,
    `hospital: ${JSON.stringify((s.hospital || "").slice(0, 80))}`,
    `result_json: ${JSON.stringify(JSON.stringify(result))}`,
  ];
  if (opts.sourceFile)
    fields.push(`source_file: ${JSON.stringify(opts.sourceFile.slice(0, 120))}`);
  if (s.reportDate) fields.push(`report_date: ${JSON.stringify(s.reportDate)}`);

  const data = await gql<{
    insert_scan_record_one: { id: number } | null;
  }>(
    opts.config.endpoint,
    `mutation { insert_scan_record_one(object: { ${fields.join("\n")} }) { id } }`,
    opts.transport ?? fetch,
  );
  const id = data.insert_scan_record_one?.id;
  if (!id) throw Error("扫描记录写入 Zion 失败");
  return { recordId: id, imageId, downloadUrl };
}
