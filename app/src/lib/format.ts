export function fmtVal(v: number, decimals: number): string {
  return v.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
