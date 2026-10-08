// 日期小工具（不引 date-fns，演示版够用）

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return toISO(d)
}

/** 显示用：10-07 */
export function fmtShort(iso: string): string {
  return iso.slice(5)
}

/** 显示用：10月7日 */
export function fmtCN(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}月${Number(d)}日`
}

export function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00').getTime()
  const db = new Date(b + 'T12:00:00').getTime()
  return Math.round((db - da) / 86400000)
}

/** 确定性伪随机（种子固定，刷新页面数据稳定） */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
