// 病例照片只存本机 IndexedDB（localStorage 放不下照片），永不进 git、不上传仓库
export type StoredPhoto = {
  id: string;
  patientId: string;
  blob: Blob;
  mime: string;
  createdAt: string;
};

const DB_NAME = "nuanshao-photos";
const STORE = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(Error("此环境不支持本地照片存储"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? Error("照片存储打开失败"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? Error("照片存储读写失败"));
    tx.oncomplete = () => db.close();
  });
}

export async function putPhoto(photo: StoredPhoto) {
  await withStore("readwrite", (s) => s.put(photo));
}

export async function getPhoto(id: string): Promise<StoredPhoto | null> {
  return (await withStore("readonly", (s) => s.get(id))) ?? null;
}

export async function deletePhoto(id: string) {
  await withStore("readwrite", (s) => s.delete(id));
}

export type PreparedImage = { blob: Blob; dataUrl: string; mime: string };

/** 压缩到最长边 1600px 的 JPEG，兼顾清晰度与存储配额；返回 dataUrl 供解析引擎使用 */
export async function prepareImage(file: File, maxEdge = 1600): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  }).catch(() => null);
  if (!bitmap) throw Error("这张图片无法读取，请换一张照片重试");
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw Error("图片处理失败，请重试");
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { blob, dataUrl, mime: "image/jpeg" };
}

/** 取出照片并生成临时对象 URL；组件卸载时需 revokeObjectUrl */
export async function photoUrl(id: string): Promise<string> {
  const photo = await getPhoto(id);
  return photo ? URL.createObjectURL(photo.blob) : "";
}

/** 字节级指纹：同一张压缩照片重传时完全一致，用于硬去重 */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(buf)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/** 感知指纹：缩到 16×16 灰度后按均值二值化，重拍同一份纸质报告仍高度相似 */
export async function averageHash(blob: Blob, size = 16): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const d = ctx.getImageData(0, 0, size, size).data;
  const grays: number[] = [];
  for (let i = 0; i < d.length; i += 4)
    grays.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  const mean = grays.reduce((s, x) => s + x, 0) / grays.length;
  let hex = "";
  for (let i = 0; i < grays.length; i += 4) {
    let nib = 0;
    for (let b = 0; b < 4; b++) if (grays[i + b] > mean) nib |= 1 << b;
    hex += nib.toString(16);
  }
  return hex;
}
