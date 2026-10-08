import { useState } from "react";
import type { Observation } from "./model";
import { diffDays, todayISO } from "../lib/date";
import {
  previousSymptom,
  symptomScales,
  symptomValue,
  type SymptomKey,
} from "./symptoms";
export default function SymptomField({
  id,
  observations,
  at,
  editing,
}: {
  id: SymptomKey;
  observations: Observation[];
  at: string;
  editing?: Observation;
}) {
  const scale = symptomScales[id];
  const [level, setLevel] = useState(
    editing?.symptom?.severity !== undefined
      ? String(editing.symptom.severity)
      : editing?.value === "是"
        ? "legacy-yes"
        : editing?.value === "否"
          ? "legacy-no"
          : "",
  );
  const previous = previousSymptom(observations, id, at, editing?.id);
  const ago = previous ? diffDays(previous.at.slice(0, 10), todayISO()) : 0;
  return (
    <fieldset className="symptom-field">
      <legend>{scale.name}</legend>
      <p className="symptom-previous">
        {previous
          ? `上次：${symptomValue(previous)} · ${ago === 0 ? "今天" : ago === 1 ? "昨天" : ago > 0 ? `${ago} 天前` : previous.at.slice(0, 10)}${previous.at.length > 10 ? " · " + previous.at.slice(11) : " · 时间未记录"}`
          : "暂无此前记录，按本人平时状态填写"}
      </p>
      <label>
        程度
        <select
          name={id}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="">未填写</option>
          {[0, 1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {scale.labels[n]} — {scale.descriptions[n]}
            </option>
          ))}
          {editing &&
            !editing.symptom?.severity &&
            ["是", "否"].includes(editing.value) && (
              <option
                value={editing.value === "是" ? "legacy-yes" : "legacy-no"}
              >
                {symptomValue(editing)}（保留原记录）
              </option>
            )}
        </select>
      </label>
      {level && !level.startsWith("legacy") && (
        <p className="symptom-anchor">{scale.descriptions[Number(level)]}</p>
      )}
      {id === "fatigue" && (
        <p className="form-help">
          这是相对平时的精神状态自评，不包含意识异常。抽搐、意识改变请在独立紧急症状项记录，不以此评分代替。
        </p>
      )}
      <fieldset className="symptom-options">
        <legend>具体影响（可多选，未选表示未填写）</legend>
        {scale.impacts.map((impact) => (
          <label key={impact}>
            <input
              type="checkbox"
              name={id + "-impact"}
              value={impact}
              defaultChecked={editing?.symptom?.impacts.includes(impact)}
            />
            {impact}
          </label>
        ))}
      </fieldset>
      {id === "rash" && (
        <fieldset className="symptom-options">
          <legend>皮疹部位（可多选）</legend>
          {["面部", "颈部", "躯干", "上肢", "下肢", "其他部位"].map((part) => (
            <label key={part}>
              <input
                type="checkbox"
                name={id + "-part"}
                value={part}
                defaultChecked={editing?.symptom?.parts.includes(part)}
              />
              {part}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        备注（可选）
        <textarea
          name={id + "-note"}
          rows={2}
          maxLength={1000}
          defaultValue={editing?.symptom?.note}
          placeholder="例如：今天下楼比昨天容易，但穿衣仍需帮助"
        />
      </label>
      <small>自我记录分级，用于个人前后比较，不是临床严重程度</small>
    </fieldset>
  );
}
