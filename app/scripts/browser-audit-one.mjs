/** Prints JS snippet for browser Runtime.evaluate — one case-ref photo by index 0..6 */
const names = [
  "3a405989e4041dba938c1f4971223017.jpg",
  "eb09edb108d7777c4da223ac141d3219.jpg",
  "476ed806b093921cd8a13a711c27db10.jpg",
  "d705172b004af850eb0e561aae94282c.jpg",
  "cac1b3878d8b6d0ddf6938e1e0a12ed8.jpg",
  "566f72ce8265aad9756d3ec96dcfffe8.jpg",
  "ccfc6b23c4c96d6e95afe3f1a9028b2a.jpg",
];
const idx = Number(process.argv[2] ?? 0);
const name = names[idx];
const FS =
  "/@fs/Users/tqqq/Documents/git/dw/multibillion/medi-care/reference/case-ref/上传数据场景_数据表_表格_Attachment/";
console.log(`(async () => {
  const name = ${JSON.stringify(name)};
  const goScan = () => {
    const nav = (label) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === label);
      b?.click();
    };
    nav("记录");
    nav("扫描记录");
  };
  goScan();
  await new Promise((r) => setTimeout(r, 400));
  const input = document.querySelectorAll('section[aria-label="扫描记录"] input[type=file]')[1];
  if (!input) return JSON.stringify({ error: "file input missing" });
  const resp = await fetch(${JSON.stringify(FS)} + name);
  if (!resp.ok) return JSON.stringify({ error: "fetch failed", status: resp.status });
  const blob = await resp.blob();
  const file = new File([blob], name, { type: blob.type || "image/jpeg" });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  const dialog = document.querySelector("dialog.scan-modal");
  if (!dialog) return JSON.stringify({ error: "scan dialog missing", name });
  const start = [...dialog.querySelectorAll("button")].find((b) => b.textContent.includes("开始识别"));
  if (!start) return JSON.stringify({ error: "start button missing", name });
  start.click();
  return JSON.stringify({ started: true, name });
})()`);
