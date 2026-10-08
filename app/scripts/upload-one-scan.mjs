/** Emit CDP Runtime.evaluate expression: upload one case-ref photo by index 0..6 */
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
  const FS = ${JSON.stringify(FS)};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 180000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(400);
    }
    return null;
  };
  const setReactValue = (el, value) => {
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc.set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const clickLabel = (label) => {
    [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label)?.click();
  };
  window.confirm = () => true;
  const openDlg = document.querySelector('dialog.scan-modal');
  if (openDlg?.open) {
    [...openDlg.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '关闭')?.click();
    await sleep(400);
  }
  clickLabel('记录');
  await sleep(200);
  clickLabel('扫描记录');
  await sleep(400);
  const input = document.querySelectorAll('section[aria-label="扫描记录"] input[type=file]')[1];
  if (!input) return JSON.stringify({ error: 'file input missing', name });
  const resp = await fetch(FS + name);
  if (!resp.ok) return JSON.stringify({ error: 'fetch ' + resp.status, name });
  const blob = await resp.blob();
  const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const dialog = await waitFor(() => {
    const d = document.querySelector('dialog.scan-modal');
    return d?.open ? d : null;
  }, 15000);
  if (!dialog) return JSON.stringify({ error: 'dialog missing', name });
  await sleep(500);
  const start = [...dialog.querySelectorAll('button')].find((b) => b.textContent.includes('开始识别'));
  if (!start) return JSON.stringify({ error: 'start missing', name });
  start.click();
  const confirmed = await waitFor(() => {
    const d = document.querySelector('dialog.scan-modal');
    if (d?.querySelector('.scan-confirm, button.primary.submit, .scan-analysis')) return d;
    return null;
  }, 180000);
  if (!confirmed) return JSON.stringify({ error: 'parse timeout', name });
  const analysis = confirmed.querySelector('.scan-analysis')?.textContent?.trim() || '';
  const engine = confirmed.querySelector('.scan-engine')?.textContent?.trim() || '';
  const note = confirmed.querySelector('.scan-meta small')?.textContent?.trim() || '';
  const items = [...confirmed.querySelectorAll('.scan-item')].map((row) => {
    const rawName = row.querySelector('.scan-raw strong, .scan-raw')?.textContent?.trim() || '';
    const eng = row.querySelector('.scan-eng')?.textContent?.trim() || '';
    const value = row.querySelector('input[placeholder="数值"]')?.value || '';
    const unit = row.querySelector('input[placeholder="单位"]')?.value || '';
    const refRange = row.querySelector('input[placeholder="参考范围"]')?.value || '';
    const target = row.querySelector('select')?.selectedOptions?.[0]?.textContent?.trim()
      || row.querySelector('.scan-custom-name')?.value
      || '';
    return { rawName, eng, value, unit, refRange, target };
  });
  setReactValue(confirmed.querySelector('input[type=date]'), confirmed.querySelector('input[type=date]')?.value || '2024-01-01');
  setReactValue(
    [...confirmed.querySelectorAll('input')].find((i) => (i.placeholder || '').includes('医院') || i.required),
    '测试·case-ref',
  );
  // touch hospital confirm button if present
  [...confirmed.querySelectorAll('button')].find((b) => b.textContent.includes('确认医院') || b.textContent.includes('已确认'))?.click();
  await sleep(200);
  const saveBtn = [...confirmed.querySelectorAll('button')].find((b) => b.textContent.includes('确认并保存'));
  saveBtn?.click();
  await sleep(1000);
  const still = document.querySelector('dialog.scan-modal');
  const alert = still?.querySelector('[role=alert]')?.textContent?.trim() || '';
  if (still?.open) {
    [...still.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '关闭')?.click();
    await sleep(300);
  }
  return JSON.stringify({
    id: 'case-ref-${idx + 1}',
    is_active: true,
    source_file: name,
    photo_bytes: blob.size,
    engine,
    note,
    analysis,
    item_count: items.length,
    items,
    saved: !(still?.open),
    save_alert: alert,
    upload_api: {
      client_photo_store: 'IndexedDB putPhoto',
      ui_path: '扫描记录 → 本地文件夹 → 开始识别 → 确认并保存',
      zion_presign: 'getImagePresignedUrlV2',
    },
  });
})()`);
