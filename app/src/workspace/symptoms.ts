import type { Observation } from "./model";
export const symptomScales = {
  joint: {
    name: "关节肿痛",
    labels: ["无", "轻", "中", "重"],
    descriptions: [
      "无肿痛，能正常活动",
      "活动时不适，仍能完成日常活动",
      "部分日常活动受限",
      "明显影响走路或穿衣",
    ],
    impacts: ["活动时不适", "走路受限", "穿衣受限", "影响睡眠"],
  },
  fatigue: {
    name: "精神状态",
    labels: ["如常", "稍差", "明显差", "很差"],
    descriptions: [
      "与本人平时相比，互动、玩耍和活动如常",
      "比平时稍少，仍愿意参与",
      "比平时明显减少，常需要休息",
      "很少参与平时的互动或活动",
    ],
    impacts: ["互动减少", "玩耍减少", "日常活动减少", "需要更多休息"],
  },
  rash: {
    name: "皮疹",
    labels: ["无", "少量", "较多", "广泛"],
    descriptions: [
      "未见皮疹",
      "少量散在，局限于小范围",
      "多处可见，较平时涉及更多范围",
      "大范围或多个身体区域可见",
    ],
    impacts: ["瘙痒不适", "影响睡眠", "影响活动"],
  },
};
export type SymptomKey = keyof typeof symptomScales;
export const isGradedSymptom = (id: string): id is SymptomKey =>
  Object.hasOwn(symptomScales, id);
export function symptomValue(o: Observation) {
  if (!isGradedSymptom(o.metric)) return o.value;
  if (o.symptom?.severity !== undefined)
    return symptomScales[o.metric].labels[o.symptom.severity];
  if (o.value === "是") return "有症状，程度未记录";
  if (o.value === "否") return "未报告症状（旧记录）";
  return o.value;
}
export function previousSymptom(
  rows: Observation[],
  id: string,
  at: string,
  exclude?: string,
) {
  return rows
    .filter((o) => o.metric === id && o.id !== exclude && o.at < at)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}
export function symptomChange(o: Observation, rows: Observation[]) {
  if (!isGradedSymptom(o.metric)) return "";
  const previous = previousSymptom(rows, o.metric, o.at, o.id);
  if (!previous) return "首次记录，暂无对比";
  if (
    o.symptom?.severity === undefined ||
    previous.symptom?.severity === undefined
  )
    return "程度未记录，无法比较变化";
  const delta = o.symptom.severity - previous.symptom.severity;
  return delta === 0
    ? "较上次无变化"
    : `较上次${delta > 0 ? "加重" : "减轻"} ${Math.abs(delta)} 档`;
}
export function symptomDetail(o: Observation) {
  return [
    ...(o.symptom?.parts || []),
    ...(o.symptom?.impacts || []),
    o.symptom?.note || "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export function readSymptom(form: FormData, id: SymptomKey) {
  const raw = String(form.get(id) || "");
  if (!raw) {
    if (
      form.getAll(id + "-impact").length ||
      form.getAll(id + "-part").length ||
      String(form.get(id + "-note") || "").trim()
    )
      throw Error(`请先选择${symptomScales[id].name}的程度，或清空其补充内容`);
    return null;
  }
  const severity = ["0", "1", "2", "3"].includes(raw)
    ? (Number(raw) as 0 | 1 | 2 | 3)
    : undefined;
  if (severity === undefined && !["legacy-yes", "legacy-no"].includes(raw))
    throw Error("程度选项无效");
  return {
    value:
      severity === undefined
        ? raw === "legacy-yes"
          ? "是"
          : "否"
        : symptomScales[id].labels[severity],
    symptom: {
      severity,
      impacts: form.getAll(id + "-impact").map(String),
      parts: form.getAll(id + "-part").map(String),
      note: String(form.get(id + "-note") || "").trim(),
    },
  };
}
