import { useState } from "react";
import {
  ArrowRight,
  Check,
  Lightbulb,
  Shuffle,
} from "@phosphor-icons/react";
import type { Role } from "./model";
import {
  sections,
  topics,
  cards,
  quizSets,
  words,
  type LearningSection,
} from "./learningContent";

type Progress = { read: string[]; correct: string[]; words: string[] };
const empty: Progress = { read: [], correct: [], words: [] };
const ASK_ENDPOINT =
  "https://zion-app.functorz.com/zero/DqQnbOV5vvJ/api/graphql-v2";
const ASK_FLOW_ID = "a60f19aa-6500-4de9-a5e9-dd1c9322d5bd";
const assistantPrompts = [
  "铁蛋白这项检查在看什么？",
  "糖化血红蛋白和当天血糖有什么不同？",
  "照护计划和实际发生的事，为什么要分开记？",
  "关节肿痛应该怎么记录？",
];

export function Assistant() {
  const [askText, setAskText] = useState("");
  const [askThread, setAskThread] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [askPending, setAskPending] = useState(false);
  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question || askPending) return;
    setAskText("");
    setAskPending(true);
    setAskThread((thread) => [...thread, { role: "user", text: question }]);
    askConcept(question).then(
      (answer) => {
        setAskThread((thread) => [
          ...thread,
          { role: "assistant", text: answer },
        ]);
        setAskPending(false);
      },
      () => {
        setAskThread((thread) => [
          ...thread,
          { role: "assistant", text: "暂时没有回答，请稍后再试。" },
        ]);
        setAskPending(false);
      },
    );
  };
  return (
    <article className="learning-ask" aria-label="问助手">
      {askThread.length > 0 && (
        <div className="assistant-thread" role="log" aria-live="polite">
          {askThread.map((message, index) => (
            <p key={index} className={message.role}>
              {message.text}
            </p>
          ))}
          {askPending && <p className="assistant pending">正在回答</p>}
        </div>
      )}
      <div className="assistant-prompts" role="group" aria-label="可以这样问">
        <span>可以这样问</span>
        {assistantPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={askPending}
            onClick={() => ask(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          ask(askText);
        }}
      >
        <textarea
          value={askText}
          maxLength={500}
          rows={2}
          placeholder="问一个概念、检查名称，或记录方法"
          aria-label="向助手提问"
          onChange={(event) => setAskText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask(askText);
            }
          }}
        />
        <button className="primary" disabled={askPending || !askText.trim()}>
          发送
        </button>
      </form>
    </article>
  );
}

async function askConcept(question: string): Promise<string> {
  const response = await fetch(ASK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query:
        "mutation ($args: Json!) { fz_invoke_action_flow(actionFlowId: " +
        JSON.stringify(ASK_FLOW_ID) +
        ", versionId: 1, args: $args) }",
      variables: { args: { question } },
    }),
  });
  const body = await response.json();
  const answer = body?.data?.fz_invoke_action_flow;
  if (typeof answer === "string" && answer.trim()) return answer;
  throw new Error("empty");
}
export default function Learning({
  role,
  section,
  onSectionChange,
}: {
  role: Role;
  section: LearningSection;
  onSectionChange: (s: LearningSection) => void;
}) {
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
  const [topic, setTopic] = useState("全部");
  const [setIndex, setSetIndex] = useState(
    () => Math.floor(Math.random() * quizSets.length),
  );
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
  const totalQuestions = quizSets.reduce((n, s) => n + s.questions.length, 0);
  const set = quizSets[setIndex];
  const q = set.questions[question];
  const drawSet = () => {
    let next = setIndex;
    if (quizSets.length > 1)
      while (next === setIndex)
        next = Math.floor(Math.random() * quizSets.length);
    setSetIndex(next);
    setQuestion(0);
    setChoice(null);
  };
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
            {progress.correct.length}/{totalQuestions}
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
        {sections.map((s) => (
          <button
            key={s}
            aria-pressed={section === s}
            onClick={() => onSectionChange(s)}
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
            {["全部", ...topics].map((t) => (
              <button
                key={t}
                aria-pressed={topic === t}
                onClick={() => setTopic(t)}
              >
                {t}
              </button>
            ))}
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
          <div
            className="learning-topics quiz-sets"
            role="group"
            aria-label="套题选择"
          >
            {quizSets.map((s, i) => (
              <button
                key={s.id}
                title={s.title}
                aria-pressed={i === setIndex}
                onClick={() => {
                  setSetIndex(i);
                  setQuestion(0);
                  setChoice(null);
                }}
              >
                第 {i + 1} 套
              </button>
            ))}
            <button className="quiz-shuffle" onClick={drawSet}>
              <Shuffle size={14} />
              随机抽一套
            </button>
          </div>
          <p className="quiz-set-info">
            《{set.title}》 {set.description}
          </p>
          <span className="exercise-position">
            第 {question + 1} / {set.questions.length} 题
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
            {question === set.questions.length - 1 ? (
              <button className="primary" onClick={drawSet}>
                再抽一套
                <Shuffle size={18} />
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => {
                  setQuestion(question + 1);
                  setChoice(null);
                }}
              >
                下一题
                <ArrowRight size={18} />
              </button>
            )}
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
