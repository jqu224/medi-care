// 扫描录入的保存前置校验
//
// 出具医院必填：需求方小Q 的原话是「很多地方的医生他是不知道的，他是不了解的」，
// 「后期涉及到病情恶化，你没有办法转院的问题，地方医疗水平不够」。
// 「这份单子是哪家医院出的」是这种落差在数据上最直接的证据——它决定了这份
// 记录在转诊时值多少分量。所以这里做成硬性约束，而不是可选备注。

export type ScanGate = { ok: true } | { ok: false; message: string };

export const REPORT_DATE_REQUIRED =
  "请先确认报告日期，再保存。";

export const HOSPITAL_REQUIRED =
  "请先确认这份报告是哪家医院或机构出具的。这决定了这份数据在就诊、转诊时能不能作为参考。";

/**
 * 保存前的硬性校验。日期与医院都是必填——
 * 仅存档（不录入任何数值）的报告同样要求医院，因为可信度来自出处，与录不录数值无关。
 */
export function scanSaveGate(session: {
  reportDate?: string;
  hospital?: string;
}): ScanGate {
  if (!session.reportDate) return { ok: false, message: REPORT_DATE_REQUIRED };
  if (!session.hospital || !session.hospital.trim())
    return { ok: false, message: HOSPITAL_REQUIRED };
  return { ok: true };
}