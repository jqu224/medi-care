// 快速记录：3 步 bottom sheet 流（体温→症状→用药），全程 <15 秒
// 红色分支：高热或红旗症状 → 保存记录后直接转红色行动卡

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle,
  Minus,
  Pill,
  Plus,
  Syringe,
  Thermometer,
  WarningOctagon,
} from '@phosphor-icons/react'
import { Drawer, DrawerContent, DrawerTitle } from './ui/drawer'
import { Slider } from './ui/slider'
import { RED_FLAG_SYMPTOMS, SYMPTOMS, type SymptomId } from '../engine/config'
import { CHILD, type DailyLog } from '../data/seed'
import { todayISO } from '../lib/date'

const QUICK_TEMPS = [36.5, 37.3, 38.5, 39.5]

type Result =
  | { kind: 'success'; streakDays: number }
  | { kind: 'red'; reasons: string[] }

export function RecordFlow({
  open,
  onClose,
  onSave,
  onGotoTrends,
}: {
  open: boolean
  onClose: () => void
  onSave: (log: DailyLog) => number // 返回连续记录天数
  onGotoTrends: () => void
}) {
  const [step, setStep] = useState(0)
  const [temp, setTemp] = useState(37.0)
  const [symptoms, setSymptoms] = useState<Set<SymptomId>>(new Set())
  const [mg, setMg] = useState(CHILD.currentSteroidMg)
  const [bio, setBio] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const reset = () => {
    setStep(0)
    setTemp(37.0)
    setSymptoms(new Set())
    setMg(CHILD.currentSteroidMg)
    setBio(false)
    setResult(null)
  }

  const close = () => {
    onClose()
    setTimeout(reset, 250)
  }

  const toggleSymptom = (id: SymptomId) => {
    setSymptoms((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = () => {
    const log: DailyLog = {
      date: todayISO(),
      temps: [temp],
      symptoms: [...symptoms],
      steroidMg: mg,
      bio,
      medDone: true,
    }
    const streak = onSave(log)
    const reasons: string[] = []
    if (temp >= 40) reasons.push(`体温 ${temp.toFixed(1)}℃，已达高热警戒线 40℃`)
    const flags = [...symptoms].filter((s) => (RED_FLAG_SYMPTOMS as string[]).includes(s))
    if (flags.length > 0) {
      reasons.push(`出现症状：${flags.map((f) => SYMPTOMS.find((x) => x.id === f)?.label).join('、')}`)
    }
    if (reasons.length > 0) setResult({ kind: 'red', reasons })
    else setResult({ kind: 'success', streakDays: streak })
  }

  const stepValid = useMemo(() => {
    if (step === 0) return temp >= 35 && temp <= 42
    if (step === 2) return mg > 0
    return true
  }, [step, temp, mg])

  return (
    <Drawer open={open} onOpenChange={(v) => !v && close()}>
      <DrawerContent className="mx-auto max-w-[430px] rounded-t-[24px] border-stone-200 bg-[#FBF8F3] px-5 pb-6">
        <DrawerTitle className="sr-only">快速记录</DrawerTitle>

        {result ? (
          <ResultView result={result} onClose={close} onGotoTrends={() => { close(); onGotoTrends() }} />
        ) : (
          <>
            {/* 步进指示 */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-6 bg-teal-700' : i < step ? 'w-1.5 bg-teal-700/50' : 'w-1.5 bg-stone-300'
                  }`}
                />
              ))}
            </div>

            <div className="min-h-[320px] pt-4">
              {step === 0 && <StepTemp temp={temp} setTemp={setTemp} />}
              {step === 1 && <StepSymptoms symptoms={symptoms} toggle={toggleSymptom} />}
              {step === 2 && <StepMeds mg={mg} setMg={setMg} bio={bio} setBio={setBio} />}
            </div>

            <div className="mt-2 flex gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-300 text-stone-600 active:bg-stone-100"
                  aria-label="上一步"
                >
                  <ArrowLeft size={18} />
                </button>
              ) : null}
              <button
                type="button"
                disabled={!stepValid}
                onClick={() => (step < 2 ? setStep((s) => s + 1) : submit())}
                className="h-12 flex-1 rounded-full bg-teal-700 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                {step < 2 ? '下一步' : '完成记录'}
              </button>
            </div>
            {step === 0 && (
              <button type="button" onClick={() => setStep(1)} className="mt-2 w-full py-1 text-center text-[13px] text-stone-400">
                只记症状，跳过体温
              </button>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function StepTemp({ temp, setTemp }: { temp: number; setTemp: (v: number) => void }) {
  const tone = temp >= 38.3 ? 'text-amber-600' : 'text-stone-900'
  return (
    <div>
      <div className="flex items-center gap-2">
        <Thermometer size={20} weight="duotone" className="text-teal-700" />
        <h3 className="text-[17px] font-bold text-stone-900">现在体温多少？</h3>
      </div>
      <p className="tnum mt-4 text-center">
        <span className={`text-[64px] font-bold leading-none tracking-tight ${tone}`}>{temp.toFixed(1)}</span>
        <span className="ml-1 text-[20px] font-medium text-stone-400">℃</span>
      </p>
      <div className="mt-6 px-1">
        <Slider
          value={[temp]}
          onValueChange={([v]) => setTemp(Math.round(v * 10) / 10)}
          min={35}
          max={42}
          step={0.1}
          aria-label="体温"
        />
        <div className="mt-1 flex justify-between text-[11px] text-stone-400">
          <span>35</span>
          <span>37.3</span>
          <span>38.3</span>
          <span>40</span>
          <span>42</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {QUICK_TEMPS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTemp(t)}
            className={`tnum rounded-full border py-2 text-[14px] font-semibold transition-colors ${
              temp === t
                ? 'border-teal-700 bg-teal-700 text-white'
                : 'border-stone-300 bg-white text-stone-700 active:bg-stone-50'
            }`}
          >
            {t.toFixed(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

function StepSymptoms({ symptoms, toggle }: { symptoms: Set<SymptomId>; toggle: (id: SymptomId) => void }) {
  return (
    <div>
      <h3 className="text-[17px] font-bold text-stone-900">今天有哪些症状？</h3>
      <p className="mt-0.5 text-[13px] text-stone-500">没有就不选，直接下一步</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SYMPTOMS.map((s) => {
          const on = symptoms.has(s.id)
          const redFlag = 'redFlag' in s && s.redFlag
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className={`rounded-full border px-4 py-2.5 text-[14px] font-medium transition-colors ${
                on
                  ? redFlag
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-teal-700 bg-teal-700 text-white'
                  : redFlag
                    ? 'border-amber-300 bg-white text-amber-800 active:bg-amber-50'
                    : 'border-stone-300 bg-white text-stone-700 active:bg-stone-50'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>
      {[...symptoms].some((s) => (RED_FLAG_SYMPTOMS as string[]).includes(s)) && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          所选症状属于需要紧急评估的红旗症状，完成记录后会给出就医建议
        </p>
      )}
    </div>
  )
}

function StepMeds({
  mg,
  setMg,
  bio,
  setBio,
}: {
  mg: number
  setMg: (v: number) => void
  bio: boolean
  setBio: (v: boolean) => void
}) {
  return (
    <div>
      <h3 className="text-[17px] font-bold text-stone-900">今天的用药</h3>
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <Pill size={22} weight="duotone" />
        </span>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-stone-900">泼尼松</p>
          <p className="text-[12px] text-stone-500">减量期，按医嘱剂量</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMg(Math.max(0, Math.round((mg - 1.25) * 4) / 4))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-600 active:bg-stone-100"
            aria-label="减少剂量"
          >
            <Minus size={16} />
          </button>
          <span className="tnum w-16 text-center text-[18px] font-bold text-stone-900">{mg} mg</span>
          <button
            type="button"
            onClick={() => setMg(Math.round((mg + 1.25) * 4) / 4)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-600 active:bg-stone-100"
            aria-label="增加剂量"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setBio(!bio)}
        aria-pressed={bio}
        className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <Syringe size={22} weight="duotone" />
        </span>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-stone-900">{CHILD.bioDrug}</p>
          <p className="text-[12px] text-stone-500">{bio ? '今日已注射' : '今日注射了点这里确认'}</p>
        </div>
        <span
          className={`h-6 w-6 rounded-full border-2 transition-colors ${
            bio ? 'border-emerald-600 bg-emerald-600' : 'border-stone-300 bg-white'
          }`}
        />
      </button>
    </div>
  )
}

function ResultView({
  result,
  onClose,
  onGotoTrends,
}: {
  result: Result
  onClose: () => void
  onGotoTrends: () => void
}) {
  if (result.kind === 'red') {
    return (
      <div className="pt-2">
        <div className="rounded-[20px] border border-red-300 bg-red-50 p-5">
          <div className="flex items-center gap-2 text-red-700">
            <WarningOctagon size={24} weight="fill" />
            <h3 className="text-[17px] font-bold">这些症状需要尽快就医（24 小时内）</h3>
          </div>
          <ul className="mt-3 space-y-1.5">
            {result.reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-red-900">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-red-200 pt-3 text-[13px] leading-relaxed text-red-900">
            本平台不能替代医生判断。请联系主治医生，或前往最近的儿童医院，并出示近 14 天体温与用药记录。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-12 w-full rounded-full bg-red-600 text-[15px] font-semibold text-white active:opacity-90"
        >
          已知晓，记录已保存
        </button>
      </div>
    )
  }
  return (
    <div className="pt-6 text-center">
      <CheckCircle size={64} weight="fill" className="mx-auto text-emerald-600" />
      <h3 className="mt-3 text-[19px] font-bold text-stone-900">今天的记录已完成</h3>
      <p className="mt-1 text-[14px] text-stone-500">趋势曲线已更新 · 连续记录第 {result.streakDays} 天</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-full border border-stone-300 text-[15px] font-semibold text-stone-600 active:bg-stone-100"
        >
          关闭
        </button>
        <button
          type="button"
          onClick={onGotoTrends}
          className="h-12 flex-1 rounded-full bg-teal-700 text-[15px] font-semibold text-white active:opacity-90"
        >
          查看趋势
        </button>
      </div>
    </div>
  )
}
