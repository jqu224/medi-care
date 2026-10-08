import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CaretUp,
  Check,
  ChatCircle,
  Lightbulb,
  Shuffle,
  Sparkle,
} from "@phosphor-icons/react";
import type { Patient, Role } from "./model";
import ScrollTicker from "./ScrollTicker";
import {
  ASSISTANT_GUARDRAIL,
  CONTEXT_WINDOW_OPTIONS,
  DEFAULT_CONTEXT_DAYS,
  FOCUS_ALL,
  type ContextWindow,
  defaultFocus,
  focusOptions,
  privacyNote,
  promptHint,
  buildContext,
  capConversations,
  conversationTitle,
  loadHistory,
  saveHistory,
  questionGroups,
  rotateSmart,
  smartQuestions,
  type Conversation,
  type Turn,
} from "./assistant";
import { AI_DISCLAIMER } from "../engine/config";
import type { StaticVerdict } from "../engine/staticScoring";
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

/* ── 问助手 ──────────────────────────────────────────────────────
   走 Zion 行为流，密钥只存在于 Zion 项目环境变量里，前端只带 flow ID。
   flow ID 改为可配置：行为流被删或改 ID 时，不该在前端持续报错而无从排查。 */
const ASK_ENDPOINT =
  "https://zion-app.functorz.com/zero/DqQnbOV5vvJ/api/graphql-v2";
const ASK_FLOW_ID =
  import.meta.env?.VITE_ZION_ASK_FLOW_ID?.trim() || "a60f19aa-6500-4de9-a5e9-dd1c9322d5bd";

async function askAssistant(question: string, context: unknown): Promise<string> {
  const response = await fetch(ASK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query:
        "mutation ($args: Json!) { fz_invoke_action_flow(actionFlowId: " +
        JSON.stringify(ASK_FLOW_ID) +
        ", versionId: 1, args: $args) }",
      variables: { args: { question, context } },
    }),
  });
  const body = await response.json();
  const answer = body?.data?.fz_invoke_action_flow;
  if (typeof answer === "string" && answer.trim()) return answer;
  throw new Error("empty");
}

export function Assistant({
  patient,
  role,
  alerts,
  verdicts,
  nameOf,
  unitOf,
  historyOpen,
  onHistoryOpenChange,
}: {
  patient: Patient;
  role: Role;
  alerts: { level: string; title: string }[];
  verdicts?: StaticVerdict[];
  nameOf?: (metricId: string) => string;
  unitOf?: (metricId: string) => string;
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
}) {
  const [askText, setAskText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [askPending, setAskPending] = useState(false);
  const [win, setWin] = useState<ContextWindow>(DEFAULT_CONTEXT_DAYS);
  /* 关注的病种可切换：标题里那颗下拉就是它 */
  const focuses = focusOptions(patient);
  const [focus, setFocus] = useState(() => defaultFocus(patient));
  /* 「Lucy」按钮：每点一次换一批智能问题 */
  const [smartOffset, setSmartOffset] = useState(0);
  /* 没对话时问题分组是主角；一旦开始问答，就把它们收起来，
     否则七八张问题卡会横在回答和输入框中间，挡住真正要用的东西。 */
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [history, setHistory] = useState<Conversation[]>(() =>
    loadHistory(localStorage, role, patient.id),
  );
  const [historyWarn, setHistoryWarn] = useState("");

  const groups = questionGroups(patient, focus);
  /* 智能提问的候选来自真实记录：指标变化、判分位置、用药事件、正在响的警报 */
  const smartPool = smartQuestions({ patient, verdicts, nameOf, unitOf, alerts });
  const smart = rotateSmart(smartPool, smartOffset);

  /* 每次提问后落盘。写失败不阻断对话——历史是可选项，不是功能前提。
     封顶与落盘都交给 saveHistory，它以存储里的现状为准，
     不会因为这里的 history 是旧闭包而把上一段对话挤掉。 */
  const persist = (nextTurns: Turn[], stamp = new Date().toISOString()) => {
    const convo: Conversation = {
      id: `${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: stamp,
      updatedAt: stamp,
      title: conversationTitle(nextTurns),
      turns: nextTurns,
    };
    const written = saveHistory(localStorage, role, patient.id, convo);
    if (written) {
      setHistory(written);
      setHistoryWarn("");
    } else {
      /* 写盘失败也要让这段对话继续留在屏幕上，只是不保证刷新后还在 */
      setHistory(capConversations([convo, ...history]));
      setHistoryWarn("这段对话没能保存到本机，刷新后会丢失");
    }
  };

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question || askPending) return;
    setAskText("");
    setAskPending(true);
    /* 点问题就发：发完把清单收起来，别让清单继续挡在回答和输入框之间 */
    setPromptsOpen(false);
    const withUser: Turn[] = [...turns, { role: "user", text: question }];
    setTurns(withUser);
    const context = buildContext({ patient, alerts, verdicts, window: win, unitOf });
    askAssistant(question, { ...context, guardrail: ASSISTANT_GUARDRAIL }).then(
      (answer) => {
        const done: Turn[] = [...withUser, { role: "assistant", text: answer }];
        setTurns(done);
        setAskPending(false);
        persist(done);
      },
      () => {
        const done: Turn[] = [...withUser, { role: "assistant", text: "暂时没有回答，请稍后再试" }];
        setTurns(done);
        setAskPending(false);
        persist(done);
      },
    );
  };

  return (
    <article className="learning-ask" aria-label="问助手">
      <header className="assistant-hero">
        <div className="assistant-hero-text">
          <h2 className="assistant-hero-title">
            你关注的是{" "}
            <span className="assistant-focus">
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                aria-label="切换关注的病种"
              >
                <option value={FOCUS_ALL}>所有问题</option>
                {focuses.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </span>
          </h2>
          <p className="assistant-hero-lead">{promptHint()}</p>
        </div>
        <label className="assistant-window">
          <span>读取记录</span>
          <select
            value={String(win)}
            onChange={(e) =>
              setWin(
                e.target.value === "all"
                  ? "all"
                  : (Number(e.target.value) as ContextWindow),
              )
            }
            aria-label="读取记录范围"
          >
            {CONTEXT_WINDOW_OPTIONS.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {turns.length > 0 && (
        <div className="assistant-thread" role="log" aria-live="polite">
          {turns.map((message, index) => (
            <p key={index} className={message.role}>
              {message.text}
            </p>
          ))}
          {askPending && <p className="assistant pending">正在回答</p>}
        </div>
      )}

      <section className="assistant-prompts" aria-label="你可能想问的">
        <div className="assistant-prompts-head">
          <h3>你可能想问的</h3>
          <div className="assistant-prompts-actions">
            {turns.length > 0 && (
              <button
                type="button"
                className="assistant-prompts-toggle"
                aria-expanded={promptsOpen}
                onClick={() => setPromptsOpen((v) => !v)}
              >
                {promptsOpen ? "收起" : "展开"}
              </button>
            )}
            {/* Lucy：看一遍已有记录，换一批更贴合当前数据的问题 */}
            <button
              type="button"
              className="assistant-lucy"
              onClick={() => setSmartOffset((v) => v + 1)}
              disabled={smartPool.length === 0}
              title="重新分析记录，换一批问题"
            >
              <Sparkle size={15} aria-hidden="true" />
              换一批
            </button>
          </div>
        </div>
        {(turns.length === 0 || promptsOpen) && (
          <>
            {smart.length > 0 && (
              <section className="smart-questions" aria-label="根据你的记录生成的问题">
                <h4 className="smart-session">
                  <span>根据你的记录生成</span>
                </h4>
                <ul>
                  {smart.map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        className="smart-question"
                        disabled={askPending}
                        onClick={() => ask(q.ask)}
                      >
                        <span className="smart-premise">
                          <Sparkle size={13} aria-hidden="true" />
                          {q.premise}
                        </span>
                        <span className="smart-ask">
                          <ChatCircle size={13} aria-hidden="true" />
                          {q.ask}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="assistant-prompts-note">
              这些问题会自动结合孩子的过往数据，由 AI 分析后再回答，数据里没有的，它会直接说明
            </p>
            {groups.map((group) => (
              <div className="prompt-group" key={group.id}>
                {/* session line：标签压在一段渐隐的细线上，把不同病种的问题分开 */}
                <h4 className="prompt-session">
                  <span>{group.label}</span>
                </h4>
                <ul>
                  {group.questions.map((question) => (
                    <li key={question}>
                      <button type="button" disabled={askPending} onClick={() => ask(question)}>
                        <span>{question}</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </section>

      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          ask(askText);
        }}
      >
        {/* 问过一轮之后，输入框左上角留一个出口：
            点它回到「你可能想问的」那张清单，换一个问题再问 */}
        {turns.length > 0 && (
          <div className="assistant-composer-bar">
            <button
              type="button"
              className="assistant-back"
              aria-expanded={promptsOpen}
              onClick={() => setPromptsOpen((v) => !v)}
            >
              {promptsOpen ? <CaretUp size={14} aria-hidden="true" /> : <ArrowLeft size={14} aria-hidden="true" />}
              {promptsOpen ? "收起问题清单" : "换个问题"}
            </button>
          </div>
        )}
        <div className="assistant-composer-row">
          <textarea
            value={askText}
            maxLength={500}
            rows={2}
            placeholder="也可以直接问：这几天的情况怎么样？"
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
        </div>
      </form>

      {historyWarn && <p className="assistant-warn">{historyWarn}</p>}

      <p className="assistant-privacy">{privacyNote(win)}</p>

      {historyOpen && (
        <div className="assistant-history" role="dialog" aria-label="历史对话">
          <header>
            <strong>历史对话</strong>
            <button type="button" aria-label="关闭历史对话" onClick={() => onHistoryOpenChange(false)}>
              关闭
            </button>
          </header>
          {history.length === 0 ? (
            <p className="assistant-history-empty">还没有历史对话</p>
          ) : (
            <ul>
              {history.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTurns(c.turns);
                      onHistoryOpenChange(false);
                    }}
                  >
                    <span>{c.title}</span>
                    <small>{c.updatedAt.slice(0, 10)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="assistant-foot">
        <ScrollTicker text={AI_DISCLAIMER} />
      </div>
    </article>
  );
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
      setSaveError("学习进度暂未保存，当前练习可继续");
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
                setSaveError("仍未保存，请检查浏览器存储后重试");
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
                  ? "答对了，记住这个区别"
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
            点击字母慢慢拼出来，猜错也可以继续，键盘聚焦此区域后可直接输入
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
                ? `一起记住：${word.word} = ${word.meaning}，下次再自己试试`
                : hint
                  ? word.hint
                  : "不计失败次数，每次尝试都是学习"}
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
