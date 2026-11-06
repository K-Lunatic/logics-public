"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { resolveModelProfile } from "@ink/ai";
import {
  AI_REQUESTS_PER_MINUTE_MAX,
  AI_REQUESTS_PER_MINUTE_MIN,
  getDefaultRequestsPerMinute,
  completeOnboardingAction,
  createAutomationAccessAction,
  getAutomationAccessAction,
  getOnboardingStatusAction,
  revokeAutomationAccessAction,
} from "@ink/assembler";
import { useInkChatSettings } from "@/context/InkChatSettingsProvider";

type SettingsTab = "PROFILE" | "GENERAL" | "AI" | "API";

export function SettingsModal() {
  const { data: session, status } = useSession();
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    preferences,
    setPreferences,
  } = useInkChatSettings();
  const [tab, setTab] = useState<SettingsTab>("PROFILE");
  const [draft, setDraft] = useState(preferences);
  const [profile, setProfile] = useState({
    userNickname: "",
    fullName: "",
    birthDate: "",
    region: "",
    heightCm: undefined as number | undefined,
    weightKg: undefined as number | undefined,
  });
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [weatherApiKey, setWeatherApiKey] = useState("");
  const [removeGeminiApiKey, setRemoveGeminiApiKey] = useState(false);
  const [removeWeatherApiKey, setRemoveWeatherApiKey] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [automation, setAutomation] = useState<{
    userId: string;
    enabled: boolean;
    keyPrefix: string | null;
    createdAt: string | null;
  } | null>(null);
  const [newAutomationKey, setNewAutomationKey] = useState("");
  const [automationBusy, setAutomationBusy] = useState(false);
  const modelProfile = resolveModelProfile(
    draft.aiModel,
    draft.aiCapabilityMode,
    draft.aiReliabilityMode,
  );

  useEffect(() => {
    // 편집 중 변경과 저장된 설정을 분리하기 위해 열릴 때만 초안을 초기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isSettingsOpen) setDraft(preferences);
  }, [isSettingsOpen, preferences]);

  useEffect(() => {
    if (!isSettingsOpen || status !== "authenticated") return;
    void getAutomationAccessAction().then(setAutomation);
    void getOnboardingStatusAction().then((current) => {
      setProfile({
        userNickname: current.profile?.nickname || session?.user?.name || "",
        fullName: current.profile?.fullName || session?.user?.name || "",
        birthDate: current.profile?.birthDate || "",
        region: current.profile?.region || "",
        heightCm: current.health?.heightCm,
        weightKg: current.latestWeightKg,
      });
    });
  }, [isSettingsOpen, session?.user?.name, status]);

  if (!isSettingsOpen) return null;

  const save = async () => {
    if (status !== "authenticated" || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await completeOnboardingAction({
        ...profile,
        aiNickname: draft.nickname,
        tone: draft.tone,
        customInstructions: draft.customInstructions,
        fontScale: draft.fontScale,
        aiModel: draft.aiModel,
        aiCapabilityMode: draft.aiCapabilityMode,
        aiReliabilityMode: draft.aiReliabilityMode,
        aiRequestsPerMinute: draft.aiRequestsPerMinute,
        geminiApiKey: geminiApiKey || undefined,
        weatherApiKey: weatherApiKey || undefined,
        removeGeminiApiKey,
        removeWeatherApiKey,
      });
      if (!result.success) throw new Error(result.error);
      setPreferences(result.settings);
      setGeminiApiKey("");
      setWeatherApiKey("");
      setRemoveGeminiApiKey(false);
      setRemoveWeatherApiKey(false);
      setMessage("설정을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-stone-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="환경설정"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[30px] border border-stone-200 bg-white shadow-2xl sm:rounded-[30px]"
      >
        <header className="flex items-center justify-between border-b border-stone-100 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold text-stone-400">PERSONAL SETTINGS</p>
            <h2 className="text-xl font-black text-stone-900">환경설정</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            aria-label="환경설정 닫기"
            className="rounded-full bg-stone-100 px-3 py-2 text-sm font-bold text-stone-600"
          >
            닫기
          </button>
        </header>

        <nav aria-label="환경설정 분류" className="grid grid-cols-4 border-b border-stone-100 px-3 sm:px-5">
          {([
            ["PROFILE", "내 정보"],
            ["GENERAL", "화면"],
            ["AI", "AI 성격"],
            ["API", "개인 API"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`border-b-2 px-2 py-3 text-sm font-bold ${
                tab === id ? "border-stone-950 text-stone-950" : "border-transparent text-stone-400"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="scrollbar-hidden min-h-0 flex-1 overscroll-contain overflow-y-auto p-5 sm:p-6">
          {tab === "PROFILE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileInput
                label="사용자 별명"
                required
                value={profile.userNickname}
                onChange={(value) => setProfile({ ...profile, userNickname: value })}
                placeholder="앱에서 나를 부를 이름"
              />
              <ProfileInput
                label="본명"
                required
                value={profile.fullName}
                onChange={(value) => setProfile({ ...profile, fullName: value })}
              />
              <ProfileInput
                label="생년월일"
                required
                type="date"
                value={profile.birthDate}
                onChange={(value) => setProfile({ ...profile, birthDate: value })}
              />
              <ProfileInput
                label="지역"
                required
                value={profile.region}
                onChange={(value) => setProfile({ ...profile, region: value })}
                placeholder="예: 서울특별시 강남구"
                hint="기상청 행정구역 데이터와 일치해야 합니다."
              />
              <ProfileInput
                label="키 (cm)"
                type="number"
                value={profile.heightCm ?? ""}
                onChange={(value) => setProfile({ ...profile, heightCm: value ? Number(value) : undefined })}
              />
              <ProfileInput
                label="몸무게 (kg)"
                type="number"
                value={profile.weightKg ?? ""}
                onChange={(value) => setProfile({ ...profile, weightKg: value ? Number(value) : undefined })}
              />
            </div>
          )}
          {tab === "GENERAL" && (
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-2 text-sm font-black text-stone-800">글씨 크기</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["SMALL", "작게"],
                    ["MEDIUM", "보통"],
                    ["LARGE", "크게"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDraft({ ...draft, fontScale: value })}
                      className={`rounded-xl border px-3 py-3 text-sm font-bold ${
                        draft.fontScale === value
                          ? "border-stone-950 bg-stone-950 text-white"
                          : "border-stone-200 text-stone-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-500">
                선택한 크기는 이 계정의 모바일과 데스크톱 화면에 함께 적용됩니다.
              </p>
            </div>
          )}

          {tab === "AI" && (
            <div className="space-y-5">
              <label className="block text-sm font-bold text-stone-700">
                사용할 Gemini 모델
                <select
                  value={draft.aiModel}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      aiModel: event.target.value as typeof draft.aiModel,
                      aiRequestsPerMinute:
                        draft.aiRequestsPerMinute ||
                        getDefaultRequestsPerMinute(
                          event.target.value as typeof draft.aiModel,
                        ),
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 font-normal"
                >
                  <option value="gemini-3.6-flash">3.6 Flash · 에이전트 작업 권장</option>
                  <option value="gemini-3.5-flash-lite">3.5 Flash-Lite · 빠르고 저렴함</option>
                  <option value="gemini-3.1-pro-preview">3.1 Pro · 복잡한 추론</option>
                </select>
              </label>
              <label className="block text-sm font-bold text-stone-700">
                분당 AI 호출 한도 (RPM)
                <input
                  type="number"
                  min={AI_REQUESTS_PER_MINUTE_MIN}
                  max={AI_REQUESTS_PER_MINUTE_MAX}
                  value={draft.aiRequestsPerMinute}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      aiRequestsPerMinute: Math.max(
                        AI_REQUESTS_PER_MINUTE_MIN,
                        Math.min(
                          AI_REQUESTS_PER_MINUTE_MAX,
                          Number(event.target.value || AI_REQUESTS_PER_MINUTE_MIN),
                        ),
                      ),
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 font-normal"
                />
                <span className="mt-1 block text-xs font-normal text-stone-500">
                  {draft.aiModel} 권장값 {getDefaultRequestsPerMinute(draft.aiModel)}회/분
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold text-stone-700">
                  모델 성능 판정
                  <select
                    value={draft.aiCapabilityMode}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        aiCapabilityMode:
                          event.target.value as typeof draft.aiCapabilityMode,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 font-normal"
                  >
                    <option value="AUTO">자동 판정</option>
                    <option value="LOW">낮음 · 짧은 문맥/추가 검증</option>
                    <option value="BALANCED">보통</option>
                    <option value="HIGH">높음 · 긴 문맥</option>
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">
                  실행 정책
                  <select
                    value={draft.aiReliabilityMode}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        aiReliabilityMode:
                          event.target.value as typeof draft.aiReliabilityMode,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 font-normal"
                  >
                    <option value="FAST">속도 우선</option>
                    <option value="BALANCED">균형</option>
                    <option value="RELIABLE">정확도 우선</option>
                  </select>
                </label>
              </div>
              <p className="rounded-2xl bg-stone-50 p-4 text-xs leading-5 text-stone-500">
                현재 판정: <strong>{modelProfile.capability}</strong> · 문맥
                {modelProfile.contextMessages}개 · 최대 {modelProfile.maxSteps}단계 ·
                누락 복구 {modelProfile.recoveryPasses}회.
                {!preferences.hasGeminiApiKey &&
                  " 개인 Gemini API 키를 저장해야 이 모델과 정책이 적용됩니다."}
              </p>
              <label className="block text-sm font-bold text-stone-700">
                AI 별명
                <input
                  value={draft.nickname}
                  maxLength={30}
                  onChange={(event) => setDraft({ ...draft, nickname: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3 font-normal"
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm font-bold text-stone-700">말투와 성격</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["CAT_NYANG", "🐾 다정한 고양이"],
                    ["POLITE", "💼 정중한 비서"],
                    ["ANALYTICAL", "📊 냉철한 분석가"],
                    ["CUSTOM", "✏️ 사용자 지정"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDraft({ ...draft, tone: value })}
                      className={`rounded-xl border p-3 text-left text-sm font-bold ${
                        draft.tone === value
                          ? "border-stone-950 bg-stone-950 text-white"
                          : "border-stone-200 text-stone-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-bold text-stone-700">
                추가 지침
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={draft.customInstructions}
                  onChange={(event) => setDraft({ ...draft, customInstructions: event.target.value })}
                  className="mt-2 w-full resize-none rounded-xl border border-stone-200 px-3 py-3 font-normal"
                  placeholder="예: 결론부터 짧게 말하고, 중요한 수치는 표로 보여줘."
                />
              </label>
            </div>
          )}

          {tab === "API" && (
            <div className="space-y-5">
              <SecretInput
                label="Gemini API 키"
                saved={preferences.hasGeminiApiKey}
                value={geminiApiKey}
                onChange={setGeminiApiKey}
                remove={removeGeminiApiKey}
                onRemoveChange={setRemoveGeminiApiKey}
                placeholder="AIza..."
              />
              <SecretInput
                label="기상청 API 키"
                saved={preferences.hasWeatherApiKey}
                value={weatherApiKey}
                onChange={setWeatherApiKey}
                remove={removeWeatherApiKey}
                onRemoveChange={setRemoveWeatherApiKey}
                placeholder="공공데이터포털 인증키"
              />
              <div className="rounded-2xl border border-stone-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-stone-800">외부 자동화 API</h3>
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      iPhone 단축어와 홈 센서에서 온·습도를 보내거나 읽습니다.
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold ${automation?.enabled ? "text-emerald-600" : "text-stone-400"}`}>
                    {automation?.enabled ? "사용 중" : "미발급"}
                  </span>
                </div>

                {automation && (
                  <dl className="mt-3 space-y-1 rounded-xl bg-stone-50 p-3 font-mono text-[11px] text-stone-600">
                    <div><dt className="inline font-bold">User ID </dt><dd className="inline break-all">{automation.userId}</dd></div>
                    <div><dt className="inline font-bold">Endpoint </dt><dd className="inline">/api/v1/environment</dd></div>
                    {automation.keyPrefix && (
                      <div><dt className="inline font-bold">Key </dt><dd className="inline">{automation.keyPrefix}…</dd></div>
                    )}
                  </dl>
                )}

                {newAutomationKey && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-800">지금 한 번만 표시됩니다. 단축어에 저장하세요.</p>
                    <code className="mt-2 block break-all text-xs text-amber-950">{newAutomationKey}</code>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(newAutomationKey)}
                      className="mt-2 text-xs font-black text-amber-800 underline"
                    >
                      키 복사
                    </button>
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (automationBusy) return;
                      setAutomationBusy(true);
                      try {
                        const created = await createAutomationAccessAction();
                        setNewAutomationKey(created.key);
                        setAutomation({
                          userId: created.userId,
                          enabled: true,
                          keyPrefix: created.keyPrefix,
                          createdAt: created.createdAt,
                        });
                      } catch {
                        setMessage("자동화 키를 발급하지 못했습니다.");
                      } finally {
                        setAutomationBusy(false);
                      }
                    }}
                    disabled={automationBusy}
                    className="flex-1 rounded-xl bg-stone-950 px-3 py-2.5 text-xs font-black text-white"
                  >
                    {automationBusy ? "처리 중..." : automation?.enabled ? "키 교체" : "키 발급"}
                  </button>
                  {automation?.enabled && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (automationBusy) return;
                        setAutomationBusy(true);
                        try {
                          await revokeAutomationAccessAction();
                          setNewAutomationKey("");
                          setAutomation({ ...automation, enabled: false, keyPrefix: null, createdAt: null });
                        } catch {
                          setMessage("자동화 키를 폐기하지 못했습니다.");
                        } finally {
                          setAutomationBusy(false);
                        }
                      }}
                      disabled={automationBusy}
                      className="rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-black text-rose-700"
                    >
                      폐기
                    </button>
                  )}
                </div>

                <details className="mt-3 text-xs text-stone-500">
                  <summary className="cursor-pointer font-bold">단축어 요청 형식</summary>
                  <pre className="scrollbar-hidden mt-2 overflow-x-auto rounded-xl bg-stone-950 p-3 text-[10px] leading-5 text-stone-100">{`Headers
Authorization: Bearer <자동화 키>
X-Ink-User-Id: <User ID>

POST JSON
{"deviceName":"침실 HomePod","room":"침실","temperature":24.2,"humidity":51}`}</pre>
                </details>
              </div>
              <p className="rounded-2xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">
                키는 브라우저나 채팅 기록에 저장하지 않고 서버에서 암호화합니다. AI 또는 날씨 호출 순간에만 복호화됩니다.
              </p>
            </div>
          )}
        </div>

        <footer className="border-t border-stone-100 bg-white p-4 sm:px-6">
          {message && <p role="status" className="mb-2 text-center text-sm text-stone-600">{message}</p>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={
              status !== "authenticated"
              || saving
              || !draft.nickname.trim()
              || !profile.userNickname.trim()
              || !profile.fullName.trim()
              || !profile.birthDate
              || !profile.region.trim()
            }
            className="w-full rounded-2xl bg-stone-950 py-3.5 text-sm font-black text-white disabled:bg-stone-300"
          >
            {saving ? "저장 중..." : "설정 저장"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ProfileInput({
  label,
  required,
  hint,
  ...input
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "date" | "number";
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-bold text-stone-700">
      {label}{required && <span className="text-rose-500"> *</span>}
      <input
        {...input}
        onChange={(event) => input.onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3 font-normal"
      />
      {hint && <span className="mt-1 block text-[11px] font-normal text-stone-400">{hint}</span>}
    </label>
  );
}

interface SecretInputProps {
  label: string;
  saved: boolean;
  value: string;
  onChange: (value: string) => void;
  remove: boolean;
  onRemoveChange: (value: boolean) => void;
  placeholder: string;
}

function SecretInput({
  label,
  saved,
  value,
  onChange,
  remove,
  onRemoveChange,
  placeholder,
}: SecretInputProps) {
  return (
    <div className="rounded-2xl border border-stone-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-black text-stone-800">{label}</label>
        <span className={`text-xs font-bold ${saved ? "text-emerald-600" : "text-stone-400"}`}>
          {saved ? "저장됨" : "미등록"}
        </span>
      </div>
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={remove}
        placeholder={saved ? "새 키를 입력하면 교체됩니다" : placeholder}
        className="w-full rounded-xl border border-stone-200 px-3 py-3 font-mono text-sm disabled:bg-stone-100"
      />
      {saved && (
        <label className="mt-3 flex items-center gap-2 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={remove}
            onChange={(event) => onRemoveChange(event.target.checked)}
          />
          저장된 키 삭제
        </label>
      )}
    </div>
  );
}
