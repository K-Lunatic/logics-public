"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  AI_REQUESTS_PER_MINUTE_MAX,
  AI_REQUESTS_PER_MINUTE_MIN,
  getDefaultRequestsPerMinute,
  completeOnboardingAction,
  getOnboardingStatusAction,
  type OnboardingInput,
  type PublicUserSettings,
} from "@ink/assembler";
import { PenTool } from "lucide-react";
import { useInkChatSettings } from "@/context/InkChatSettingsProvider";

type OnboardingStatus = Awaited<ReturnType<typeof getOnboardingStatusAction>>;

const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { setPreferences } = useInkChatSettings();
  const [profileStatus, setProfileStatus] = useState<OnboardingStatus | null>(null);
  const [checkedUserId, setCheckedUserId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    getOnboardingStatusAction()
      .then((value) => {
        if (active) {
          setProfileStatus(value);
          setCheckedUserId(session?.user?.id || "");
        }
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "";
        setLoadError(
          /429|Too Many Requests|cooldown/i.test(message)
            ? "데이터 요청이 잠시 많습니다. 잠시 후 다시 확인해 주세요."
            : message || "초기 설정을 확인하지 못했습니다.",
        );
      });
    return () => {
      active = false;
    };
  }, [revision, session?.user?.id, status]);

  if (status !== "authenticated") return null;
  if (loadError) {
    return (
      <div className="fixed inset-0 z-[180] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-2xl">
          <h2 className="text-lg font-black text-stone-950">초기 설정 확인 실패</h2>
          <p className="mt-2 text-sm text-stone-500">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError("");
              setRevision((value) => value + 1);
            }}
            className="mt-4 w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-black text-white"
          >
            다시 확인
          </button>
        </div>
      </div>
    );
  }
  if (!profileStatus || checkedUserId !== session?.user?.id) return null;
  if (profileStatus.complete) return children;

  return (
    <OnboardingModal
      status={profileStatus}
      sessionName={session?.user?.name || ""}
      onComplete={(settings) => {
        setPreferences(settings);
        setProfileStatus((current) => current ? { ...current, complete: true, missingFields: [] } : current);
      }}
    />
  );
}

function OnboardingModal({
  status,
  sessionName,
  onComplete,
}: {
  status: OnboardingStatus;
  sessionName: string;
  onComplete: (settings: PublicUserSettings) => void;
}) {
  const [form, setForm] = useState<OnboardingInput>({
    userNickname: status.profile?.nickname || sessionName || "",
    aiNickname: status.settings.nickname || "Ink",
    fullName: status.profile?.fullName || sessionName || "",
    birthDate: status.profile?.birthDate || "",
    region: status.profile?.region || "",
    heightCm: status.health?.heightCm,
    weightKg: status.latestWeightKg,
    geminiApiKey: "",
    weatherApiKey: "",
    tone: status.settings.tone,
    customInstructions: status.settings.customInstructions,
    fontScale: status.settings.fontScale,
    aiModel: status.settings.aiModel,
    aiCapabilityMode: status.settings.aiCapabilityMode,
    aiReliabilityMode: status.settings.aiReliabilityMode,
    aiRequestsPerMinute:
      status.settings.aiRequestsPerMinute ||
      getDefaultRequestsPerMinute(status.settings.aiModel),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="fixed inset-0 z-[180] flex items-end bg-stone-950/55 backdrop-blur-md sm:items-center sm:justify-center sm:p-5">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          setError("");
          const result = await completeOnboardingAction(form);
          setSaving(false);
          if (!result.success) {
            setError(result.error);
            return;
          }
          onComplete(result.settings);
        }}
        className="scrollbar-hidden max-h-[96dvh] w-full overflow-y-auto rounded-t-[32px] bg-stone-50 shadow-2xl sm:max-w-3xl sm:rounded-[32px]"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-stone-200/70 bg-stone-950 px-5 py-4 text-white sm:px-7">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
            <PenTool aria-hidden="true" size={21} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Welcome to Blank</p>
            <h1 id="onboarding-title" className="text-lg font-black">생활 기준을 먼저 맞출게요</h1>
          </div>
        </header>

        <div className="space-y-4 p-4 sm:p-7">
          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-black text-stone-950">기본 정보</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="사용자 별명" required>
                <input autoFocus required value={form.userNickname} onChange={(event) => set("userNickname", event.target.value)} placeholder="앱에서 나를 부를 이름" className="onboarding-input" />
              </Field>
              <Field label="본명" required>
                <input required autoComplete="name" value={form.fullName} onChange={(event) => set("fullName", event.target.value)} placeholder="본명" className="onboarding-input" />
              </Field>
              <Field label="생년월일" required>
                <input required type="date" max={todayString()} value={form.birthDate} onChange={(event) => set("birthDate", event.target.value)} className="onboarding-input" />
              </Field>
              <Field label="지역" required>
                <input required value={form.region} onChange={(event) => set("region", event.target.value)} placeholder="예: 서울특별시 강남구" className="onboarding-input" />
                <span className="mt-1 block text-[10px] font-medium text-stone-400">기상청 행정구역 데이터와 일치하는 지역만 저장됩니다.</span>
              </Field>
              <Field label="키" hint="선택">
                <NumberInput value={form.heightCm} unit="cm" onChange={(value) => set("heightCm", value)} />
              </Field>
              <Field label="몸무게" hint="선택">
                <NumberInput value={form.weightKg} unit="kg" onChange={(value) => set("weightKg", value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-black text-stone-950">AI 기본 성격</h2>
            <Field label="AI 별명" required>
              <input required value={form.aiNickname} onChange={(event) => set("aiNickname", event.target.value)} placeholder="예: Ink" className="onboarding-input" />
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["POLITE", "정중함", "차분하고 친절하게"],
                ["ANALYTICAL", "분석적", "근거와 수치를 우선"],
                ["CAT_NYANG", "친근함", "가볍고 생동감 있게"],
                ["CUSTOM", "직접 설정", "아래 지침을 따름"],
              ] as const).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={form.tone === value}
                  onClick={() => set("tone", value)}
                  className={`rounded-2xl border p-3 text-left ${form.tone === value ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-stone-50 text-stone-700"}`}
                >
                  <strong className="block text-xs">{label}</strong>
                  <span className={`mt-1 block text-[10px] ${form.tone === value ? "text-stone-300" : "text-stone-400"}`}>{description}</span>
                </button>
              ))}
            </div>
            <Field label="AI에게 항상 적용할 지침">
              <textarea value={form.customInstructions} onChange={(event) => set("customInstructions", event.target.value)} rows={3} className="onboarding-input resize-none" />
            </Field>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="사용 모델">
                <select
                  value={form.aiModel}
                  onChange={(event) => {
                    const aiModel = event.target.value as OnboardingInput["aiModel"];
                    set("aiModel", aiModel);
                    if (!form.aiRequestsPerMinute) {
                      set("aiRequestsPerMinute", getDefaultRequestsPerMinute(aiModel));
                    }
                  }}
                  className="onboarding-input"
                >
                  <option value="gemini-3.6-flash">Gemini 3.6 Flash · 균형</option>
                  <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite · 절약</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro · 고성능</option>
                </select>
              </Field>
              <Field label="분당 호출 한도">
                <input
                  type="number"
                  min={AI_REQUESTS_PER_MINUTE_MIN}
                  max={AI_REQUESTS_PER_MINUTE_MAX}
                  value={form.aiRequestsPerMinute}
                  onChange={(event) =>
                    set(
                      "aiRequestsPerMinute",
                      Math.max(
                        AI_REQUESTS_PER_MINUTE_MIN,
                        Math.min(
                          AI_REQUESTS_PER_MINUTE_MAX,
                          Number(event.target.value || AI_REQUESTS_PER_MINUTE_MIN),
                        ),
                      ),
                    )
                  }
                  className="onboarding-input"
                />
                <span className="mt-1 block text-[10px] font-medium text-stone-400">
                  {form.aiModel} 권장값 {getDefaultRequestsPerMinute(form.aiModel)}회/분
                </span>
              </Field>
              <Field label="모델 성능 판단">
                <select value={form.aiCapabilityMode} onChange={(event) => set("aiCapabilityMode", event.target.value as OnboardingInput["aiCapabilityMode"])} className="onboarding-input">
                  <option value="AUTO">자동 판단</option>
                  <option value="LOW">낮은 성능으로 보완</option>
                  <option value="BALANCED">균형</option>
                  <option value="HIGH">고성능</option>
                </select>
              </Field>
              <Field label="실행 신뢰성">
                <select value={form.aiReliabilityMode} onChange={(event) => set("aiReliabilityMode", event.target.value as OnboardingInput["aiReliabilityMode"])} className="onboarding-input">
                  <option value="BALANCED">균형</option>
                  <option value="RELIABLE">누락 재검증</option>
                  <option value="FAST">빠른 실행</option>
                </select>
              </Field>
              <Field label="글씨 크기">
                <select value={form.fontScale} onChange={(event) => set("fontScale", event.target.value as OnboardingInput["fontScale"])} className="onboarding-input">
                  <option value="SMALL">작게</option>
                  <option value="MEDIUM">보통</option>
                  <option value="LARGE">크게</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-black text-stone-950">개인 API 키 <span className="font-medium text-stone-400">선택</span></h2>
            <p className="mt-1 text-xs text-stone-500">입력한 키는 서버에서 암호화하며 브라우저로 다시 반환하지 않습니다.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Gemini API 키" hint={status.settings.hasGeminiApiKey ? "등록됨" : "선택"}>
                <input type="password" autoComplete="off" value={form.geminiApiKey} onChange={(event) => set("geminiApiKey", event.target.value)} placeholder={status.settings.hasGeminiApiKey ? "새 키 입력 시 교체" : "AIza…"} className="onboarding-input" />
              </Field>
              <Field label="기상청 API 키" hint={status.settings.hasWeatherApiKey ? "등록됨" : "선택"}>
                <input type="password" autoComplete="off" value={form.weatherApiKey} onChange={(event) => set("weatherApiKey", event.target.value)} placeholder={status.settings.hasWeatherApiKey ? "새 키 입력 시 교체" : "서비스 키"} className="onboarding-input" />
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-3xl bg-stone-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black">필수 정보와 선택한 AI 기준을 안전하게 저장합니다.</p>
              <p className="mt-1 text-xs text-stone-400">선택 항목은 비워두고 시작해도 됩니다.</p>
              {error && <p role="alert" className="mt-2 text-xs font-bold text-rose-300">{error}</p>}
            </div>
            <button
              disabled={saving || !form.userNickname.trim() || !form.aiNickname.trim() || !form.fullName.trim() || !form.birthDate || !form.region.trim()}
              className="shrink-0 rounded-2xl bg-white px-6 py-3 text-sm font-black text-stone-950 disabled:opacity-40"
            >
              {saving ? "저장 중…" : "설정 완료하고 시작"}
            </button>
          </section>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="mt-3 block text-xs font-black text-stone-600">
      {label} {required && <span className="text-rose-500">*</span>}
      {hint && <span className="ml-1 font-medium text-stone-400">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function NumberInput({
  value,
  unit,
  onChange,
}: {
  value?: number;
  unit: string;
  onChange: (value?: number) => void;
}) {
  return (
    <span className="flex items-center rounded-xl border border-stone-200 bg-stone-50 pr-3 focus-within:border-stone-500">
      <input
        type="number"
        min="0"
        step="0.1"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : undefined)}
        className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-medium text-stone-900 outline-none"
      />
      <span className="text-xs text-stone-400">{unit}</span>
    </span>
  );
}
