// 扫描录入 UI：ScanDialog（上传→解析→原件并排确认）与 ScanRecords（记录页扫描记录面板）
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  ScanText,
  Trash2,
  X,
} from "lucide-react";
import { CaretDown } from "@phosphor-icons/react";
import { scanSaveGate } from "./scanGate";
import { todayISO } from "../lib/date";
import {
  NEW_METRIC,
  SCAN_SOURCE,
  extractReportDate,
  emptySession,
  findDuplicatePhoto,
  isSimilarScan,
  itemSeqLabels,
  scanSignature,
  sessionToRows,
  type ScanEngineKind,
  type ScanRecord,
  type ScanSession,
} from "./scanSession";
import {
  aiConfigured,
  aiParse,
  runScanChain,
} from "./scanEngines";
import {
  averageHash,
  deletePhoto,
  photoUrl,
  prepareImage,
  putPhoto,
  sha256Hex,
  type PreparedImage,
} from "./photoStore";
import type { Actor, Database, Metric, Patient } from "./model";
import { uid, now } from "./model";
import {
  checkUnit,
  convertNote,
  factorLabel,
  prettyUnit,
  type UnitCheck,
} from "./scanUnits";

const ENV = import.meta.env as unknown as Record<string, string | undefined>;
const ENGINE_LABEL: Record<ScanEngineKind, string> = {
  vision: "AI 识别",
  ocr: "本地识别",
  manual: "手动填写",
};

export function ScanDialog({
  db,
  patient,
  actor,
  update,
  editing,
  incoming,
  onClose,
  onSaved,
}: {
  db: Database;
  patient: Patient;
  actor: Actor;
  update: (fn: (p: Patient) => void, extra?: (d: Database) => void) => void;
  editing?: ScanRecord;
  incoming?: File;
  onClose: () => void;
  onSaved: (notice: string) => void;
}) {
  const aiReady = aiConfigured(ENV);
  const [stage, setStage] = useState<"pick" | "parsing" | "confirm">(
    editing ? "confirm" : "pick",
  );
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [photoId, setPhotoId] = useState(editing?.photoId ?? "");
  const [engine, setEngine] = useState<ScanEngineKind>(editing?.engine ?? "manual");
  const [note, setNote] = useState("");
  const [session, setSession] = useState<ScanSession | null>(
    editing?.session ?? null,
  );
  const [raw, setRaw] = useState("");
  const [followUps, setFollowUps] = useState<
    { assistantJson: string; userAnswer: string }[]
  >([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [bigPhoto, setBigPhoto] = useState(false);
  const [fingerprints, setFingerprints] = useState<{
    sha: string;
    ahash: string;
  } | null>(null);
  const [dup, setDup] = useState<{
    kind: "exact" | "similar";
    scan: ScanRecord;
  } | null>(null);
  const savedRef = useRef(false);
  const newPhotoRef = useRef(false);
  const touchedRef = useRef(false);
  /* 医院名由 AI/OCR 识别而来，未经用户确认前要显示「请确认」。
     与 touchedRef 分开：前者管确认语义，后者管表单是否被碰过。 */
  const hospitalConfirmedRef = useRef(false);
  /* 逐行审查模式：一次聚焦一行，上一个/下一个走位，确认过的行打勾。
     只存在于这次确认会话里，不写进记录（改动过的行会自动取消已确认） */
  const [review, setReview] = useState(false);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!editing) return;
    let url = "";
    let alive = true;
    photoUrl(editing.photoId).then((u) => {
      if (alive) {
        url = u;
        setPreviewUrl(u);
      }
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [editing]);

  const close = () => {
    if (
      stage !== "pick" &&
      !savedRef.current &&
      !confirm("有未保存的识别内容，放弃并关闭？")
    )
      return;
    if (newPhotoRef.current && !savedRef.current && photoId)
      deletePhoto(photoId).catch(() => {});
    onClose();
  };

  const pickFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError("");
    setDup(null);
    try {
      const next = await prepareImage(file);
      setPrepared(next);
      setPreviewUrl(next.dataUrl);
      const [sha, ahash] = await Promise.all([
        sha256Hex(next.blob),
        averageHash(next.blob),
      ]);
      setFingerprints({ sha, ahash });
      const others = (patient.scans ?? []).filter((s) => s.id !== editing?.id);
      const hit = others.length ? findDuplicatePhoto(others, sha, ahash) : null;
      setDup(hit);
      if (hit?.kind === "exact")
        setError(
          `这张照片与已有扫描（${hit.scan.session.reportDate || hit.scan.createdAt.slice(0, 10)}）完全相同，已阻止识别。请先在扫描记录中删除那条，或换一张照片`,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片读取失败，请换一张重试");
    }
  };

  const incomingRef = useRef(incoming);
  useEffect(() => {
    if (incomingRef.current) void pickFile(incomingRef.current);
  }, []);

  const begin = async (manual: boolean) => {
    if (!prepared) return;
    setStage("parsing");
    setBusy(manual ? "正在保存照片…" : "识别中，照片较大或首次使用本地识别时可能要等十几秒…");
    let id = editing?.photoId ?? "";
    try {
      if (!id) {
        id = uid();
        await putPhoto({
          id,
          patientId: patient.id,
          blob: prepared.blob,
          mime: prepared.mime,
          createdAt: now(),
        });
        newPhotoRef.current = true;
      }
    } catch {
      setStage("pick");
      setBusy("");
      setError("照片保存失败，请重试");
      return;
    }
    setPhotoId(id);
    if (manual) {
      setEngine("manual");
      setNote("");
      setSession(
        emptySession("照片已保存，请对照左侧原件逐项填写，确认后才会生成检测记录"),
      );
      setStage("confirm");
      setBusy("");
      return;
    }
    try {
      const outcome = await runScanChain({
        dataUrl: prepared.dataUrl,
        env: ENV,
      });
      setEngine(outcome.engine);
      setNote(outcome.note);
      setRaw(outcome.raw ?? "");
      setSession(outcome.session);
    } catch {
      setEngine("manual");
      setNote("识别过程出现异常，请对照原件手动填写");
      setSession(emptySession("识别没有完成，请对照原件手动填写"));
    }
    setStage("confirm");
    setBusy("");
  };

  const applyLocalAnswer = (index: number, option: string) => {
    const s = session!;
    const q = s.questions[index];
    const rest = s.questions.filter((_, i) => i !== index);
    if (q?.kind === "date") {
      const d = extractReportDate(option);
      if (d) {
        setSession({ ...s, reportDate: d, questions: rest });
        return;
      }
    }
    setSession({ ...s, questions: rest });
  };

  const answer = async (index: number, option: string) => {
    const s = session!;
    const q = s.questions[index];
    if (
      engine !== "vision" ||
      !aiReady ||
      !raw ||
      !prepared ||
      followUps.length >= 2
    ) {
      applyLocalAnswer(index, option);
      return;
    }
    if (
      touchedRef.current &&
      !confirm("根据回答重新整理会覆盖你已修改的内容，继续？")
    )
      return;
    setBusy("正在根据你的回答重新整理…");
    try {
      const fu = [
        ...followUps,
        { assistantJson: raw, userAnswer: `${q.text}：${option}` },
      ];
      const parsed = await aiParse({
        env: ENV,
        dataUrl: prepared.dataUrl,
        followUp: fu,
      });
      if (!parsed) throw Error("未配置 AI 解析");
      setFollowUps(fu);
      setRaw(parsed.raw);
      setSession({
        ...parsed.session,
        reportDate: s.reportDate || parsed.session.reportDate,
        hospital: s.hospital || parsed.session.hospital,
      });
      touchedRef.current = false;
      /* 重新识别会换掉医院名，确认态要一并清掉，否则会沿用上一次的「已确认」。 */
      hospitalConfirmedRef.current = false;
    } catch {
      applyLocalAnswer(index, option);
    } finally {
      setBusy("");
    }
  };

  const setItem = (id: string, patch: Partial<ScanSession["items"][number]>) => {
    touchedRef.current = true;
    setSession((s) =>
      s
        ? {
            ...s,
            items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
          }
        : s,
    );
    /* 改过的行「已确认」作废：确认要对着最后改完的内容才有意义 */
    setReviewed((r) => {
      if (!r.has(id)) return r;
      const next = new Set(r);
      next.delete(id);
      return next;
    });
  };

  /* 逐行审查：定位到第 i 行并滚动到视野里居中 */
  const reviewGo = (i: number) => {
    const items = session?.items ?? [];
    if (!items.length) return;
    const idx = Math.min(items.length - 1, Math.max(0, i));
    setReviewIdx(idx);
    rowRefs.current.get(items[idx].id)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  };

  const reviewToggle = () => {
    if (review) {
      setReview(false);
      return;
    }
    setReview(true);
    reviewGo(reviewIdx);
  };

  const reviewConfirm = () => {
    const items = session?.items ?? [];
    const idx = Math.min(Math.max(0, reviewIdx), items.length - 1);
    const it = items[idx];
    if (!it) return;
    setReviewed((r) => new Set(r).add(it.id));
    if (idx < items.length - 1) reviewGo(idx + 1);
  };

  const save = () => {
    const s = session!;
    setError("");
    const gate = scanSaveGate(s);
    if (!gate.ok) {
      setError(gate.message);
      return;
    }
    const lookup = (id: string) => {
      const m = db.metrics.find((x) => x.id === id);
      return m ? { name: m.name, unit: m.unit } : undefined;
    };
    const { rows, error: rowError, blocked } = sessionToRows(s, lookup);
    if (rowError) {
      setError(rowError);
      return;
    }
    if (blocked.length) {
      setError(
        `以下项目的单位与所选指标不一致，无法换算，已阻止保存：${blocked.join("、")}，请改选「新建自定义指标」或「不录入（仅存档）」`,
      );
      return;
    }
    if (!rows.length && !confirm("没有勾选任何录入项，仅保存照片存档，不生成检测记录？"))
      return;
    const customs: Metric[] = [];
    /* 复用旧自定义指标时若其单位为空，用报告单位回填（单位只是展示口径，不回改历史数值） */
    const unitFills: { id: string; unit: string }[] = [];
    /* itemId → 实际入库的指标 id：保存后回写到识别结果，再次编辑显示为现有指标 */
    const writes: { itemId: string; metricId: string }[] = [];
    const finalRows = rows.map((r) => {
      if (r.metric) {
        if (r.fillUnit) unitFills.push({ id: r.metric, unit: r.fillUnit });
        writes.push({ itemId: r.itemId, metricId: r.metric });
        return { metric: r.metric, value: r.value };
      }
      const name = (r.custom?.name ?? "").trim() || "未命名指标";
      const existing = db.metrics.find(
        (m) => m.custom && m.type === "number" && m.name === name,
      );
      if (existing) {
        if (!existing.unit && r.custom?.unit)
          unitFills.push({ id: existing.id, unit: r.custom.unit });
        writes.push({ itemId: r.itemId, metricId: existing.id });
        return { metric: existing.id, value: r.value };
      }
      const id = uid();
      customs.push({
        id,
        name,
        unit: r.custom?.unit ?? "",
        type: "number",
        custom: true,
      });
      writes.push({ itemId: r.itemId, metricId: id });
      return { metric: id, value: r.value };
    });
    const byItem = new Map(writes.map((w) => [w.itemId, w.metricId]));
    const confirmedSession: ScanSession = {
      ...s,
      items: s.items.map((i) =>
        byItem.has(i.id) ? { ...i, target: byItem.get(i.id)! } : i,
      ),
    };
    const record: ScanRecord = {
      id: editing?.id ?? uid(),
      photoId,
      createdAt: editing?.createdAt ?? now(),
      author: actor.name,
      engine,
      session: confirmedSession,
      group: editing?.group ?? uid(),
      ...(fingerprints
        ? { photoHash: fingerprints.sha, photoAhash: fingerprints.ahash }
        : { photoHash: editing?.photoHash, photoAhash: editing?.photoAhash }),
    };
    /* 保存前双保险：字节级同照片直接拒绝；同日期+条目相近需确认（建议先删原件） */
    const others = (patient.scans ?? []).filter((x) => x.id !== record.id);
    if (
      fingerprints &&
      others.some((x) => x.photoHash && x.photoHash === fingerprints.sha)
    ) {
      setError(
        "这张照片与已有扫描完全相同，已拒绝保存，请先在扫描记录中删除那条，再重新上传",
      );
      return;
    }
    const similar = others.find((x) => isSimilarScan(s, x.session));
    if (
      similar &&
      !confirm(
        `与已有扫描（${similar.session.reportDate} · ${scanSignature(similar.session).length} 项）报告日期相同、条目相近，可能重复录入，仍要保存？\n建议先在扫描记录中删除原件后再上传。`,
      )
    )
      return;
    try {
      update(
        (p) => {
          p.observations = p.observations.filter((o) => o.group !== record.group);
          for (const r of finalRows)
            p.observations.push({
              id: uid(),
              group: record.group,
              metric: r.metric,
              value: r.value,
              context: "",
              at: s.reportDate,
              created: now(),
              source: SCAN_SOURCE,
              author: actor.name,
            });
          p.scans = [...(p.scans ?? []).filter((x) => x.id !== record.id), record];
        },
        (d) => {
          if (customs.length) d.metrics.push(...customs);
          for (const f of unitFills) {
            const m = d.metrics.find((x) => x.id === f.id);
            if (m && !m.unit) m.unit = f.unit;
          }
        },
      );
    } catch {
      setError("保存失败，请重试，输入已保留");
      return;
    }
    savedRef.current = true;
    onSaved(
      finalRows.length
        ? "扫描记录已确认，检测与趋势已同步更新"
        : "照片已存档，未生成检测记录",
    );
  };

  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    return () => before?.focus();
  }, []);

  /* 与原件对照用的行编号：原报告印刷序号优先，缺号按连续序回推补全 */
  const seqLabels = session ? itemSeqLabels(session.items) : [];
  /* 审查光标兜底：删行后索引可能越界，显示与操作都按有效范围钳住 */
  const reviewAt = session
    ? Math.min(Math.max(0, reviewIdx), Math.max(0, session.items.length - 1))
    : 0;

  return (
    <dialog
      ref={dialogRef}
      className={"modal scan-modal" + (bigPhoto ? " is-photo-big" : "")}
      aria-label={editing ? "修改扫描记录" : "添加扫描记录"}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <h2>{editing ? "修改扫描记录" : "添加扫描记录"}</h2>
        <button aria-label="关闭" onClick={close}>
          <X size={23} />
        </button>
      </div>
      {stage === "pick" && (
        <div className="scan-pick">
          <p className="form-help">
            适合识别：化验单、住院或门诊病历。手写体温单识别率低，建议手动录入体温
            {aiReady
              ? " 已配置 AI 解析，识别时照片会发送到所配置的解析服务"
              : " 未配置 AI 解析服务，将使用浏览器本地识别，也可直接手动填写"}
          </p>
          <div className="scan-sources">
            <label>
              照相机
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <label>
              本地文件夹
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {previewUrl && (
            <div className="scan-file">
              <img src={previewUrl} alt="待识别的照片预览" />
            </div>
          )}
          {error && (
            <p className="save-error" role="alert">
              {error}
            </p>
          )}
          {dup?.kind === "similar" && !error && (
            <p className="form-help" role="status">
              这张照片与已有扫描（{dup.scan.session.reportDate || dup.scan.createdAt.slice(0, 10)}）看起来非常相近，可能是同一份报告重拍。建议先在扫描记录中删除原件再上传
            </p>
          )}
          <div className="scan-actions">
            <button
              className="secondary"
              disabled={!prepared || dup?.kind === "exact"}
              onClick={() => begin(true)}
            >
              跳过识别，手动填写
            </button>
            <button
              className="primary"
              disabled={!prepared || dup?.kind === "exact"}
              onClick={() => begin(false)}
            >
              开始识别
            </button>
          </div>
        </div>
      )}
      {stage === "parsing" && (
        <div className="scan-parsing" role="status">
          {previewUrl && <img src={previewUrl} alt="正在识别的照片" />}
          <p>{busy}</p>
        </div>
      )}
      {stage === "confirm" && session && (
        <div className={"scan-confirm" + (bigPhoto ? " is-photo-big" : "")}>
          <div className="scan-photo">
            {previewUrl && (
              <PhotoZoomer
                src={previewUrl}
                alt="报告原件"
                big={bigPhoto}
                onToggleBig={() => setBigPhoto((b) => !b)}
              />
            )}
            <small>
              {bigPhoto
                ? "拖动原件平移 · 滚轮缩放 · 右侧表格可直接编辑"
                : "点击放大原件（放大后可拖动，右侧仍可编辑）"}
            </small>
          </div>
          <div className="scan-side">
            <div className="scan-meta">
              <span className="scan-engine">{ENGINE_LABEL[engine]}</span>
              {note && <small role="status">{note}</small>}
            </div>
            {session.analysis && <p className="scan-analysis">{session.analysis}</p>}
            {busy && <p role="status">{busy}</p>}
            {session.questions.length > 0 && (
              <div className="scan-questions">
                {session.questions.map((q, i) => (
                  <div key={i} className="scan-question">
                    <p>{q.text}</p>
                    <div className="scan-options">
                      {q.options.map((o) => (
                        <button key={o} onClick={() => answer(i, o)}>
                          {o}
                        </button>
                      ))}
                      <button
                        className="ghost"
                        onClick={() => applyLocalAnswer(i, "")}
                      >
                        都不合适
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="form-two">
              <label>
                报告日期
                <input
                  type="date"
                  value={session.reportDate || todayISO()}
                  onChange={(e) => {
                    touchedRef.current = true;
                    setSession({ ...session, reportDate: e.target.value });
                  }}
                />
              </label>
              <label>
                医院或机构 <em className="required">必填</em>
                <input
                  value={session.hospital}
                  required
                  aria-required="true"
                  placeholder="照片上看不清请手动填写，这项必填"
                  onChange={(e) => {
                    touchedRef.current = true;
                    hospitalConfirmedRef.current = true;
                    setSession({ ...session, hospital: e.target.value });
                  }}
                />
                {session.hospital && !hospitalConfirmedRef.current && (
                  <small className="scan-confirm-hint">
                    已从报告识别为「{session.hospital}」，请确认无误
                  </small>
                )}
              </label>
            </div>
            {session.items.length > 0 && (
              <div
                className={"scan-review" + (review ? " is-on" : "")}
                role="group"
                aria-label="逐行审查"
              >
                <button
                  type="button"
                  className="scan-review-toggle"
                  aria-pressed={review}
                  onClick={reviewToggle}
                >
                  <ListChecks size={16} />
                  逐行审查模式
                </button>
                {review && (
                  <>
                    <span className="scan-review-pos" role="status">
                      第 <b>{reviewAt + 1}</b> / {session.items.length} 行
                      {reviewed.size > 0 && ` · 已确认 ${reviewed.size}`}
                    </span>
                    <div className="scan-review-nav">
                      <button
                        type="button"
                        aria-label="上一个"
                        disabled={reviewAt === 0}
                        onClick={() => reviewGo(reviewAt - 1)}
                      >
                        <ChevronLeft size={16} />
                        上一个
                      </button>
                      <button
                        type="button"
                        aria-label="下一个"
                        disabled={reviewAt >= session.items.length - 1}
                        onClick={() => reviewGo(reviewAt + 1)}
                      >
                        下一个
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="scan-items">
              <div className="scan-items-head">
                <span>原文项目</span>
                <span>录入到</span>
                <span>数值</span>
                <span />
              </div>
              {session.items.map((it, idx) => {
                const prev = idx > 0 ? session.items[idx - 1] : undefined;
                const multiCol =
                  new Set(
                    session.items
                      .map((x) => x.col)
                      .filter((c) => c !== undefined),
                  ).size > 1;
                const showCol =
                  multiCol && it.col !== undefined && (!prev || prev.col !== it.col);
                return (
                  <Fragment key={it.id}>
                    {showCol && (
                      <p className="scan-col-divider">
                        {it.col === 0 ? "原件左列" : "原件右列"} · 按列自上而下
                      </p>
                    )}
                    <div
                      ref={(el) => {
                        if (el) rowRefs.current.set(it.id, el);
                        else rowRefs.current.delete(it.id);
                      }}
                      className={
                        "scan-item" +
                        (it.target === NEW_METRIC ? " is-new" : "") +
                        (review
                          ? " is-review" +
                            (idx === reviewAt ? " is-current" : "") +
                            (reviewed.has(it.id) ? " is-reviewed" : "")
                          : "")
                      }
                    >
                  <div className="scan-raw">
                    <strong>
                      {seqLabels[idx] && (
                        <SeqBadge label={seqLabels[idx]} />
                      )}
                      {it.abnormal === "high" && <b className="up">↑</b>}
                      {it.abnormal === "low" && <b className="down">↓</b>}
                      {it.rawName || "（新行）"}
                      {it.eng && <em className="scan-eng">{it.eng}</em>}
                      {it.target === NEW_METRIC && (
                        <span className="scan-new-badge">将新建指标</span>
                      )}
                    </strong>
                    {it.refRange && <small>参考 {it.refRange}</small>}
                  </div>
                  <div className="scan-target">
                    {it.target === NEW_METRIC ? (
                      <>
                        <input
                          className="scan-custom-name"
                          value={it.name}
                          placeholder="新指标名称"
                          aria-label="新指标名称"
                          onChange={(e) => setItem(it.id, { name: e.target.value })}
                        />
                        <button
                          type="button"
                          className="scan-repick"
                          onClick={() => setItem(it.id, { target: "" })}
                        >
                          改选
                        </button>
                      </>
                    ) : (
                      <label>
                        <span className="sr-only">录入目标</span>
                        <select
                          value={it.target}
                          onChange={(e) =>
                            setItem(it.id, { target: e.target.value })
                          }
                        >
                          <option value="">不录入（仅存档）</option>
                          {db.metrics
                            .filter((m) => m.type === "number")
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                                {m.unit ? `（${prettyUnit(m.unit)}）` : ""}
                              </option>
                            ))}
                          <option value={NEW_METRIC}>新建自定义指标</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="scan-value">
                    <span className="sr-only">数值</span>
                    <input
                      inputMode="decimal"
                      value={it.value}
                      placeholder="数值"
                      onChange={(e) => setItem(it.id, { value: e.target.value })}
                    />
                    {it.unit && <small title={it.unit}>{prettyUnit(it.unit)}</small>}
                  </label>
                  <UnitNote item={it} metrics={db.metrics} row />
                  {review && idx === reviewAt && (
                    <button
                      type="button"
                      className="scan-review-ok"
                      onClick={reviewConfirm}
                    >
                      <Check size={15} />
                      {reviewed.has(it.id)
                        ? idx < session.items.length - 1
                          ? "已确认 · 下一行"
                          : "已确认"
                        : "确认本行"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={"删除 " + (it.rawName || "这一行")}
                    className="scan-remove"
                    onClick={() => {
                      touchedRef.current = true;
                      setSession({
                        ...session,
                        items: session.items.filter((x) => x.id !== it.id),
                      });
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                    </div>
                  </Fragment>
                );
              })}
              <button
                type="button"
                className="scan-add"
                onClick={() => {
                  touchedRef.current = true;
                  setSession({
                    ...session,
                    items: [
                      ...session.items,
                      {
                        id: uid(),
                        rawName: "",
                        name: "",
                        value: "",
                        unit: "",
                        refRange: "",
                        abnormal: "",
                        target: "",
                      },
                    ],
                  });
                }}
              >
                <Plus size={16} />
                添加一行
              </button>
            </div>
            {error && (
              <p className="save-error" role="alert">
                {error}
              </p>
            )}
            <p className="form-help">
              识别结果只是录入辅助，请以纸质或电子报告原件为准；确认保存后才会生成检测记录，预警规则不变
            </p>
            <button className="primary submit" onClick={save}>
              确认并保存 <ScanText size={18} />
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** 行编号徽标：与原件逐行对照用。inferred=序号是按连续序回推的（左列没印编号），
    视觉弱一档，避免和原件印刷的序号混淆 */
function SeqBadge({ label }: { label: { label: string; inferred: boolean } }) {
  return (
    <span
      className={"scan-seq" + (label.inferred ? " is-inferred" : "")}
      title={label.inferred ? "编号按原件顺序推断" : "原报告印刷序号"}
      aria-label={`第 ${label.label} 行`}
    >
      {label.label}
    </span>
  );
}

/* 现有指标行：原图单位 vs 目录单位对齐检查（新建/仅存档行不参与） */
function unitCheckOf(
  it: { target: string; unit: string },
  metrics: Metric[],
): { check: UnitCheck; toUnit: string } | null {
  if (!it.target || it.target === NEW_METRIC) return null;
  const m = metrics.find((x) => x.id === it.target);
  if (!m) return null;
  return { check: checkUnit(it.unit, m.unit), toUnit: m.unit };
}

function unitLabel(
  c: UnitCheck,
  inTable: boolean,
  from: string,
  to: string,
): string {
  /* 换算说明要写成「数值乘以/除以 100」这样看得懂的动作，不用 ×10^k 记号。
     表单里给整句（数值怎么变 + 为什么：原图单位 → 目录单位）；记录表格里单位就
     在相邻列，只保留动作短句，整句放进 title */
  if (c.kind === "convert")
    return inTable ? `数值${factorLabel(c.k)} 换算入库` : convertNote(c.k, from, to);
  if (c.kind === "unknown")
    return inTable ? "单位未核对" : "单位未核对，请对照原件";
  if (c.kind === "incompatible")
    return inTable ? "单位不一致" : "单位与所选指标不一致，保存会被阻止";
  return "";
}

function UnitNote({
  item,
  metrics,
  inTable = false,
  row = false,
}: {
  item: { target: string; unit: string };
  metrics: Metric[];
  inTable?: boolean;
  row?: boolean;
}) {
  const found = unitCheckOf(item, metrics);
  if (!found || found.check.kind === "same") return null;
  const c = found.check;
  const cls = c.kind === "incompatible" ? "bad" : c.kind;
  const full = c.kind === "convert" ? convertNote(c.k, item.unit, found.toUnit) : "";
  return (
    <small
      className={"scan-unit-chip " + cls + (row ? " is-row-note" : "")}
      {...(inTable && full ? { title: full } : {})}
    >
      {unitLabel(c, inTable, item.unit, found.toUnit)}
    </small>
  );
}

const clampZoom = (s: number) => Math.min(6, Math.max(1, Math.round(s * 100) / 100));

/* 可缩放/可拖动的原件视图：放大后拖动平移、滚轮缩放；
   在确认界面里它是内嵌的（右侧表格可同时编辑），在记录面板里以浮层形式复用 */
function PhotoZoomer({
  src,
  alt,
  big = false,
  onToggleBig,
  onClose,
  overlay = false,
}: {
  src: string;
  alt: string;
  big?: boolean;
  onToggleBig?: () => void;
  onClose?: () => void;
  overlay?: boolean;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const moved = useRef(false);
  const applyZoom = (factor: number) => {
    const next = clampZoom(scale * factor);
    setScale(next);
    if (next <= 1) setOffset({ x: 0, y: 0 });
  };
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = clampZoom(scale * (e.deltaY < 0 ? 1.15 : 0.87));
      setScale(next);
      if (next <= 1) setOffset({ x: 0, y: 0 });
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [scale]);
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };
  return (
    <div
      ref={boxRef}
      className={
        "photo-box" +
        (big ? " is-big" : "") +
        (overlay ? " is-overlay" : "") +
        (scale > 1 ? " is-zoomed" : "")
      }
      title={scale > 1 ? "拖动平移原件" : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (scale <= 1 && !moved.current) onToggleBig?.();
      }}
      onDoubleClick={() => onToggleBig?.()}
      onPointerDown={(e) => {
        /* 工具条按钮自己处理点击：不在这层做拖动捕获，否则 click 会被重定向到盒子、加减键失灵 */
        if ((e.target as Element).closest(".photo-tools")) return;
        moved.current = false;
        if (scale <= 1) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 合成的 pointer 事件没有真实 pointerId，忽略 */
        }
        drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.px;
        const dy = e.clientY - drag.current.py;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
        setOffset({ x: drag.current.ox + dx, y: drag.current.oy + dy });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      />
      {/* 工具条自己消化点击与双击：连点缩放键不能被盒子当成「双击打开大图」 */}
      <div
        className="photo-tools"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="缩小" disabled={scale <= 1} onClick={() => applyZoom(0.87)}>
          <Minus size={16} />
        </button>
        <button type="button" aria-label="放大" disabled={scale >= 6} onClick={() => applyZoom(1.15)}>
          <Plus size={16} />
        </button>
        <button
          type="button"
          aria-label="复位"
          disabled={scale === 1 && offset.x === 0 && offset.y === 0}
          onClick={reset}
        >
          <RotateCcw size={15} />
        </button>
        {onToggleBig && (
          <button
            type="button"
            aria-label={big ? "缩小回适配视图" : "放大对照（右侧可继续编辑）"}
            onClick={onToggleBig}
          >
            {big ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
        {onClose && (
          <button type="button" aria-label="关闭放大视图" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/* 记录面板里的原件视图：取 IndexedDB blob URL 后用 PhotoZoomer 渲染（内嵌可缩放） */
function PhotoUrl({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let u = "";
    let alive = true;
    photoUrl(src).then((next) => {
      if (alive) {
        u = next;
        setUrl(next);
      }
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [src]);
  if (!url)
    return (
      <div className="photo-box" style={{ minHeight: 160 }} aria-label={alt} />
    );
  return <PhotoZoomer src={url} alt={alt} onToggleBig={() => onOpen(url)} />;
}

function Thumb({
  photoId,
  alt,
  onOpen,
}: {
  photoId: string;
  alt: string;
  onOpen?: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let u = "";
    let alive = true;
    photoUrl(photoId).then((next) => {
      if (alive) {
        u = next;
        setUrl(next);
      }
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [photoId]);
  if (!url) return <span className="scan-thumb-miss" aria-label={alt} />;
  return onOpen ? (
    <img
      src={url}
      alt={alt}
      role="button"
      tabIndex={0}
      aria-label={alt + "，点击放大"}
      onClick={() => onOpen(url)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(url);
        }
      }}
    />
  ) : (
    <img src={url} alt={alt} />
  );
}

/* 记录面板：还原原报告全部列（中文名称/英文/结果/单位/参考范围/录入到）。
   列取最大集合——任一行有英文或参考值才出现该列；「录入到」永远在最右 */
function ScanTable({
  items,
  metrics,
}: {
  items: ScanSession["items"];
  metrics: Metric[];
}) {
  const hasEng = items.some((i) => i.eng);
  const hasRef = items.some((i) => i.refRange);
  const seqLabels = itemSeqLabels(items);
  /* 多栏报告：列号出现多次才画分隔（单栏报告 col 全 0 不打扰） */
  const multiCol =
    new Set(items.map((i) => i.col).filter((c) => c !== undefined)).size > 1;
  return (
    <div className="scan-table" role="table" aria-label="识别结果全列">
      <div
        className={
          "scan-table-head" +
          (hasEng ? " has-eng" : "") +
          (hasRef ? " has-ref" : "")
        }
        role="row"
      >
        <span role="columnheader">中文名称</span>
        {hasEng && <span role="columnheader">英文</span>}
        <span role="columnheader">结果</span>
        <span role="columnheader">单位</span>
        {hasRef && <span role="columnheader">参考范围</span>}
        <span role="columnheader">录入到</span>
      </div>
      {items.map((it, idx) => {
        const prev = idx > 0 ? items[idx - 1] : undefined;
        const showCol =
          multiCol && it.col !== undefined && (!prev || prev.col !== it.col);
        const m = it.target ? metrics.find((x) => x.id === it.target) : undefined;
        const target = !it.target ? (
          <span className="scan-target-cell muted">仅存档</span>
        ) : it.target === NEW_METRIC ? (
          <span className="scan-target-cell">
            <span className="scan-new-badge">新建</span>{" "}
            {it.name || it.rawName || "未命名"}
          </span>
        ) : m ? (
          <span className="scan-target-cell">
            {m.name}
            {m.unit && (
              <small className="cell-unit">（{prettyUnit(m.unit)}）</small>
            )}
            <UnitNote item={it} metrics={metrics} inTable />
          </span>
        ) : (
          <span className="scan-target-cell muted">未知指标</span>
        );
        return (
          <Fragment key={it.id}>
            {showCol && (
              <p className="scan-col-divider">
                {it.col === 0 ? "原件左列" : "原件右列"} · 按列自上而下
              </p>
            )}
            <div
              className={
                "scan-table-row" +
                (hasEng ? " has-eng" : "") +
                (hasRef ? " has-ref" : "")
              }
              role="row"
            >
              <span className="cell-name" role="cell" data-label="中文名称">
                {seqLabels[idx] && <SeqBadge label={seqLabels[idx]} />}
                {it.abnormal === "high" && <b className="up">↑</b>}
                {it.abnormal === "low" && <b className="down">↓</b>}
                {it.rawName || "（未命名）"}
              </span>
              {hasEng && (
                <span className="cell-eng" role="cell" data-label="英文">
                  {it.eng || "—"}
                </span>
              )}
              <span className="cell-value" role="cell" data-label="结果">
                {it.value || "—"}
              </span>
              <span
                className="cell-unit"
                role="cell"
                data-label="单位"
                {...(it.unit ? { title: it.unit } : {})}
              >
                {it.unit ? prettyUnit(it.unit) : "—"}
              </span>
              {hasRef && (
                <span className="cell-ref" role="cell" data-label="参考范围">
                  {it.refRange || "—"}
                </span>
              )}
              <span role="cell" data-label="录入到">
                {target}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export function ScanRecords({
  patient,
  metrics,
  readonly,
  onAdd,
  onEdit,
  onRemove,
}: {
  patient: Patient;
  metrics: Metric[];
  readonly: boolean;
  onAdd: (file: File) => void;
  onEdit: (scan: ScanRecord) => void;
  onRemove: (scan: ScanRecord) => void;
}) {
  const scans = [...(patient.scans ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const [zoom, setZoom] = useState("");
  return (
    <section className="panel scan-panel" aria-label="扫描记录">
      <div className="scan-panel-intro">
        <div className="record-heading">
          <h2>扫描记录</h2>
          {!readonly && <span>照片仅保存在本机浏览器</span>}
        </div>
        {readonly ? (
          <p className="scan-readonly" role="status">
            当前无法上传扫描，因为你是医生模式。
          </p>
        ) : (
          <>
            <p className="form-help scan-panel-lede">
              每次拍照识别都保留原件与识别结果，可随时回顾和修改；修改会同步更新对应的检测记录。
            </p>
            <div className="scan-sources">
            <label>
              照相机
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onAdd(file);
                }}
              />
            </label>
            <label>
              本地文件夹
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onAdd(file);
                }}
              />
            </label>
          </div>
          </>
        )}
      </div>
      {!scans.length && <p className="empty scan-panel-empty">还没有扫描记录。</p>}
      {scans.map((scan) => {
        const rows = patient.observations.filter((o) => o.group === scan.group);
        return (
          <details className="scan-card" key={scan.id}>
            <summary>
              <span className="scan-card-thumb">
                <Thumb photoId={scan.photoId} alt="扫描原件缩略图" />
              </span>
              <div>
                <strong>
                  {scan.session.reportDate || scan.createdAt.slice(0, 10)} ·{" "}
                  {ENGINE_LABEL[scan.engine]}
                </strong>
                <span>
                  {scan.session.items.filter((i) => i.target).length} 项识别 ·{" "}
                  {rows.length} 条已录入 · {scan.author}
                </span>
              </div>
              <CaretDown size={17} />
            </summary>
            <div className="scan-detail">
              <div className="scan-photo">
                <PhotoUrl src={scan.photoId} alt="报告原件" onOpen={setZoom} />
                <small>点击放大原件（可缩放拖动）</small>
              </div>
              <div className="scan-side">
                {scan.session.analysis && (
                  <p className="scan-analysis">{scan.session.analysis}</p>
                )}
                {scan.session.items.length > 0 && (
                  <ScanTable items={scan.session.items} metrics={metrics} />
                )}
                {rows.length > 0 ? (
                  <p className="scan-linked">
                    已生成 {rows.length} 条检测记录（{scan.session.reportDate}），可在时间线与趋势中查看
                  </p>
                ) : (
                  <p className="scan-linked">仅照片存档，未生成检测记录</p>
                )}
                {!readonly && (
                  <div className="scan-actions scan-card-actions">
                    <button
                      className="danger"
                      onClick={() => onRemove(scan)}
                    >
                      删除扫描与记录
                    </button>
                    <button onClick={() => onEdit(scan)}>修改这次扫描</button>
                  </div>
                )}
              </div>
            </div>
          </details>
        );
      })}
      {zoom && (
        <div
          className="scan-zoom"
          role="presentation"
          tabIndex={0}
          onClick={() => setZoom("")}
          onKeyDown={(e) => e.key === "Escape" && setZoom("")}
        >
          <PhotoZoomer
            src={zoom}
            alt="报告原件放大"
            overlay
            onClose={() => setZoom("")}
          />
          <p className="scan-zoom-hint">
            滚轮或按钮缩放 · 放大后拖动平移 · 点空白处关闭
          </p>
        </div>
      )}
    </section>
  );
}
