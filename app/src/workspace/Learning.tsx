import { useState } from "react";
import { ArrowRight, BookOpen, Check, Lightbulb } from "@phosphor-icons/react";
import type { Role } from "./model";

const sources = {
  ferritin: {
    name: "MedlinePlus · 铁蛋白检测",
    url: "https://medlineplus.gov/lab-tests/ferritin-blood-test/",
  },
  a1c: { name: "MedlinePlus · A1C", url: "https://medlineplus.gov/a1c.html" },
  jia: {
    name: "NIAMS · JIA 知识",
    url: "https://www.niams.nih.gov/health-topics/juvenile-arthritis",
  },
  mas: {
    name: "NIAMS · JIA 研究与资源",
    url: "https://www.niams.nih.gov/health-topics/juvenile-arthritis/more-info",
  },
};
const cards = [
  {
    id: "ferritin",
    topic: "检验知识",
    title: "Ferritin 是什么？",
    text: "Ferritin 是铁蛋白。铁蛋白检测帮助了解体内铁储存；结果也可能受到炎症等因素影响，不能用一个数值单独判断疾病。",
    takeaway: "读报告时，同时保留单位、日期和报告来源。",
    source: sources.ferritin,
  },
  {
    id: "a1c",
    topic: "糖尿病",
    title: "HbA1c 与当天血糖不同",
    text: "HbA1c（糖化血红蛋白）反映约过去三个月的平均血糖水平，不是某一餐之后的即时血糖。",
    takeaway: "记录血糖时注明空腹、餐后或随机背景。",
    source: sources.a1c,
  },
  {
    id: "jia",
    topic: "sJIA / MAS",
    title: "先认识 JIA 这个名字",
    text: "JIA 是 juvenile idiopathic arthritis，即幼年特发性关节炎。sJIA 是其中的全身型，症状可涉及关节以外的部位。",
    takeaway: "把症状发生的时间与变化记录下来，方便复诊沟通。",
    source: sources.jia,
  },
  {
    id: "mas",
    topic: "sJIA / MAS",
    title: "为什么要关注变化？",
    text: "MAS（巨噬细胞活化综合征）是 sJIA 的一种少见但危险的并发症。学习术语有助于沟通，判断是否发生仍需要医疗团队评估。",
    takeaway: "应用提醒是沟通线索，不是自行确诊或调药的依据。",
    source: sources.mas,
  },
  {
    id: "record",
    topic: "照护记录",
    title: "计划与实际发生，要分开记",
    text: "“计划今晚服药”和“今晚已经服药”是两件事。本应用用照护计划保存安排，用事件记录实际发生的治疗。",
    takeaway: "记录事件时写清时间；住院标签只描述这一次事件。",
    source: null,
  },
  {
    id: "risk",
    topic: "照护记录",
    title: "没有提醒，就一定安全吗？",
    text: "本应用的规则只覆盖部分场景。“未触发提醒”“未启用风险评估”和“没有数据”含义不同，不能互相替代。",
    takeaway: "就诊时带上原始报告和变化记录，不只看颜色。",
    source: null,
  },
];
const questions = [
  {
    id: "q1",
    question: "HbA1c 主要反映什么？",
    options: ["某一餐后的血糖", "约过去三个月的平均血糖", "当天最高体温"],
    answer: 1,
    explanation: "HbA1c 帮助了解一段时间的平均血糖，不等于即时血糖。",
    source: sources.a1c,
  },
  {
    id: "q2",
    question: "Ferritin 的中文名称是什么？",
    options: ["血小板", "血糖", "铁蛋白"],
    answer: 2,
    explanation:
      "Ferritin 指铁蛋白，检测有助于了解铁储存，结果需要结合背景解读。",
    source: sources.ferritin,
  },
  {
    id: "q3",
    question: "计划今天服药，就等于已经服药吗？",
    options: [
      "不等于，应另记实际服药事件",
      "等于，可以自动当作已服药",
      "只要有计划就不用记录",
    ],
    answer: 0,
    explanation: "计划是安排，事件是实际发生。两者分开能减少照护沟通误差。",
    source: null,
  },
  {
    id: "q4",
    question: "应用显示“未启用风险评估”，应该怎样理解？",
    options: ["已经确认安全", "没有任何疾病", "当前只提供记录和趋势"],
    answer: 2,
    explanation: "没有启用规则不代表正常，也不能替代医生评估。",
    source: null,
  },
  {
    id: "q5",
    question: "记录血糖时，哪个信息有助于区分测量背景？",
    options: ["手机电量", "空腹、餐后或随机", "当天应用打开次数"],
    answer: 1,
    explanation: "本应用按测量背景区分血糖趋势，避免混合比较。",
    source: null,
  },
];
const words = [
  {
    word: "FERRITIN",
    meaning: "铁蛋白",
    hint: "以 F 开头，报告中常见的检验术语。",
  },
  {
    word: "GLUCOSE",
    meaning: "葡萄糖",
    hint: "以 G 开头，blood glucose 指血糖。",
  },
  {
    word: "SYMPTOM",
    meaning: "症状",
    hint: "以 S 开头，用来描述身体出现的变化。",
  },
  { word: "DOSE", meaning: "剂量", hint: "四个字母，以 D 开头。" },
  { word: "THERAPY", meaning: "治疗", hint: "以 T 开头，七个字母。" },
];
type Progress = { read: string[]; correct: string[]; words: string[] };
const empty: Progress = { read: [], correct: [], words: [] };
export default function Learning({ role }: { role: Role }) {
  const storageKey = `nuanshao:learning:v1:${role}`;
  const [progress, setProgress] = useState<Progress>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(storageKey) || "null");
      return p &&
        [p.read, p.correct, p.words].every(
          (x) => Array.isArray(x) && x.every((v) => typeof v === "string"),
        )
        ? p
        : empty;
    } catch {
      return empty;
    }
  });
  const [section, setSection] = useState("知识卡片");
  const [topic, setTopic] = useState("全部");
  const [question, setQuestion] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [letters, setLetters] = useState<string[]>([]);
  const [hint, setHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saveError, setSaveError] = useState("");
  const save = (kind: keyof Progress, id: string) => {
    const next = { ...progress, [kind]: [...new Set([...progress[kind], id])] };
    setProgress(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveError("");
    } catch {
      setSaveError("学习进度暂未保存，当前练习可继续。");
    }
  };
  const q = questions[question];
  const word = words[wordIndex];
  const solved = [...word.word].every((letter) => letters.includes(letter));
  const guess = (letter: string) => {
    if (solved || revealed || letters.includes(letter)) return;
    const next = [...letters, letter];
    setLetters(next);
    if ([...word.word].every((l) => next.includes(l))) save("words", word.word);
  };
  return (
    <section className="learning-page" aria-label="学习中心">
      <div className="learning-intro">
        <div>
          <h2>每天懂一点，照护更从容</h2>
          <p>认识术语，读懂记录，把疑问带到下一次沟通。</p>
        </div>
        <BookOpen size={30} aria-hidden="true" />
      </div>
      <div className="learning-progress" aria-label="学习进度">
        <span>
          已读{" "}
          <b>
            {progress.read.length}/{cards.length}
          </b>
        </span>
        <span>
          答对{" "}
          <b>
            {progress.correct.length}/{questions.length}
          </b>
        </span>
        <span>
          拼出{" "}
          <b>
            {progress.words.length}/{words.length}
          </b>
        </span>
      </div>
      <div className="learning-tabs" role="group" aria-label="学习方式">
        {["知识卡片", "问答练习", "术语猜词"].map((s) => (
          <button
            key={s}
            aria-pressed={section === s}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {saveError && (
        <p role="status">
          {saveError}
          <button
            onClick={() => {
              try {
                localStorage.setItem(storageKey, JSON.stringify(progress));
                setSaveError("");
              } catch {
                setSaveError("仍未保存，请检查浏览器存储后重试。");
              }
            }}
          >
            重试保存
          </button>
        </p>
      )}
      {section === "知识卡片" && (
        <>
          <div className="learning-topics" role="group" aria-label="知识主题">
            {["全部", "sJIA / MAS", "糖尿病", "检验知识", "照护记录"].map(
              (t) => (
                <button
                  key={t}
                  aria-pressed={topic === t}
                  onClick={() => setTopic(t)}
                >
                  {t}
                </button>
              ),
            )}
          </div>
          <div className="knowledge-grid">
            {cards
              .filter((c) => topic === "全部" || c.topic === topic)
              .map((c) => (
                <article key={c.id} className="knowledge-card">
                  <span className="knowledge-topic">{c.topic}</span>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  <p className="knowledge-takeaway">
                    <Lightbulb size={18} />
                    {c.takeaway}
                  </p>
                  <div className="knowledge-actions">
                    {c.source ? (
                      <a href={c.source.url} target="_blank" rel="noreferrer">
                        {c.source.name} ↗
                      </a>
                    ) : (
                      <small>本应用使用说明</small>
                    )}
                    <button
                      disabled={progress.read.includes(c.id)}
                      onClick={() => save("read", c.id)}
                    >
                      {progress.read.includes(c.id) ? (
                        <>
                          <Check size={16} />
                          已读
                        </>
                      ) : (
                        "我读懂了"
                      )}
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </>
      )}
      {section === "问答练习" && (
        <article className="learning-exercise">
          <span className="exercise-position">
            第 {question + 1} / {questions.length} 题
          </span>
          <h3>{q.question}</h3>
          <div className="quiz-options">
            {q.options.map((o, i) => (
              <button
                key={o}
                disabled={choice !== null}
                className={
                  choice !== null && i === q.answer
                    ? "answer-correct"
                    : choice === i
                      ? "answer-retry"
                      : ""
                }
                onClick={() => {
                  setChoice(i);
                  if (i === q.answer) save("correct", q.id);
                }}
              >
                <span>{String.fromCharCode(65 + i)}</span>
                {o}
                {choice !== null && i === q.answer && <Check size={18} />}
              </button>
            ))}
          </div>
          {choice !== null && (
            <div className="learning-feedback" role="status">
              <strong>
                {choice === q.answer
                  ? "答对了，记住这个区别。"
                  : "再认识一下："}
              </strong>
              <p>{q.explanation}</p>
              {q.source && (
                <a href={q.source.url} target="_blank" rel="noreferrer">
                  查看来源 ↗
                </a>
              )}
            </div>
          )}
          <div className="exercise-actions">
            <button disabled={choice === null} onClick={() => setChoice(null)}>
              再练一次
            </button>
            <button
              className="primary"
              onClick={() => {
                setQuestion((question + 1) % questions.length);
                setChoice(null);
              }}
            >
              {question === questions.length - 1 ? "回到第一题" : "下一题"}
              <ArrowRight size={18} />
            </button>
          </div>
        </article>
      )}
      {section === "术语猜词" && (
        <article className="learning-exercise word-exercise">
          <span className="exercise-position">
            术语 {wordIndex + 1} / {words.length}
          </span>
          <h3>“{word.meaning}”用英文怎么说？</h3>
          <p>
            点击字母慢慢拼出来，猜错也可以继续。键盘聚焦此区域后可直接输入。
          </p>
          <div
            className="word-puzzle"
            tabIndex={0}
            aria-label="猜词键盘，输入英文字母"
            onKeyDown={(e) => {
              if (
                /^[a-z]$/i.test(e.key) &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey
              ) {
                e.preventDefault();
                guess(e.key.toUpperCase());
              }
            }}
          >
            <div
              className="word-slots"
              aria-label={solved || revealed ? word.word : "待拼出的英文术语"}
            >
              {[...word.word].map((l, i) => (
                <span key={i}>{letters.includes(l) || revealed ? l : "·"}</span>
              ))}
            </div>
            <div className="letter-keyboard">
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => (
                <button
                  key={l}
                  aria-label={`字母 ${l}`}
                  disabled={letters.includes(l) || solved || revealed}
                  className={
                    letters.includes(l)
                      ? word.word.includes(l)
                        ? "letter-found"
                        : "letter-tried"
                      : ""
                  }
                  onClick={() => guess(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="learning-feedback" role="status">
            {solved
              ? `拼出来了！${word.word} = ${word.meaning}`
              : revealed
                ? `一起记住：${word.word} = ${word.meaning}，下次再自己试试。`
                : hint
                  ? word.hint
                  : "不计失败次数，每次尝试都是学习。"}
          </div>
          <div className="exercise-actions">
            <button onClick={() => setHint(true)}>
              <Lightbulb size={18} />
              给我提示
            </button>
            <button
              disabled={solved || revealed}
              onClick={() => setRevealed(true)}
            >
              看看答案
            </button>
            <button
              className="primary"
              onClick={() => {
                setWordIndex((wordIndex + 1) % words.length);
                setLetters([]);
                setHint(false);
                setRevealed(false);
              }}
            >
              下一个
              <ArrowRight size={18} />
            </button>
          </div>
        </article>
      )}
      <p className="learning-note">
        学习进度仅保存在当前浏览器，按演示账号区分，不修改健康档案。医学卡片来源核对于
        2026-10-08；内容用于学习，不提供诊断或调药建议。
      </p>
    </section>
  );
}
