"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getHealthProfileAction,
  listCareRoutinesAction,
  listHealthMeasurementsAction,
  saveCareRoutineAction,
  saveHealthMeasurementAction,
  saveHealthProfileAction,
} from "@ink/assembler";
import type { CareRoutine, HealthMeasurement, HealthProfile } from "@ink/engine";

const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function HealthDashboard() {
  const [measurements, setMeasurements] = useState<HealthMeasurement[]>([]);
  const [routines, setRoutines] = useState<CareRoutine[]>([]);
  const [profile, setProfile] = useState<HealthProfile>({ updatedAt: new Date(0).toISOString() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextMeasurements, nextRoutines, nextProfile] = await Promise.all([
        listHealthMeasurementsAction(),
        listCareRoutinesAction(),
        getHealthProfileAction(),
      ]);
      setMeasurements(nextMeasurements);
      setRoutines(nextRoutines);
      setProfile(nextProfile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "건강 기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-3xl bg-stone-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Health log</p>
          <h2 className="mt-1 text-2xl font-black">몸 상태와 돌봄을 한곳에서</h2>
          <p className="mt-1 text-xs text-stone-400">복약뿐 아니라 밴드 교체·검사·처치도 같은 방식으로 추적합니다.</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            if ("Notification" in window) await Notification.requestPermission();
          }}
          className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-stone-950"
        >
          브라우저 알림 허용
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
      {loading ? (
        <p className="py-20 text-center text-sm text-stone-400">건강 기록 동기화 중…</p>
      ) : (
        <>
          <HealthProfileForm key={profile.updatedAt} profile={profile} onSaved={setProfile} />
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.75fr)]">
            <div className="space-y-4">
              <MeasurementForm
                profile={profile}
                onSaved={(item) => setMeasurements((current) => [item, ...current.filter((entry) => entry.id !== item.id)])}
              />
              <MeasurementHistory measurements={measurements} />
            </div>
            <div className="space-y-4">
              <CareRoutineForm onSaved={(item) => setRoutines((current) => [item, ...current.filter((entry) => entry.id !== item.id)])} />
              <CareRoutineList
                routines={routines}
                onChanged={(item) => setRoutines((current) => current.map((entry) => entry.id === item.id ? item : entry))}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HealthProfileForm({
  profile,
  onSaved,
}: {
  profile: HealthProfile;
  onSaved: (profile: HealthProfile) => void;
}) {
  const [heightCm, setHeightCm] = useState(String(profile.heightCm || ""));
  const [recommendedCalories, setRecommendedCalories] = useState(String(profile.recommendedCalories || ""));
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        const result = await saveHealthProfileAction({
          heightCm: Number(heightCm) || undefined,
          recommendedCalories: Number(recommendedCalories) || undefined,
        });
        setSaving(false);
        if (result.success) onSaved(result.data);
      }}
      className="grid gap-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_180px_220px_auto] sm:items-end"
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">My baseline</p>
        <h3 className="mt-1 text-base font-black text-stone-950">내 건강 기준</h3>
        <p className="mt-1 text-xs text-stone-500">키는 BMI 자동 계산에 사용되고, 권장 열량은 직접 설정한 목표값으로 표시됩니다.</p>
      </div>
      <label className="text-xs font-black text-stone-600">
        키
        <div className="mt-1 flex items-center rounded-xl border border-stone-200 px-3">
          <input type="number" min="0" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} className="min-w-0 flex-1 py-3 text-sm outline-none" />
          <span className="text-stone-400">cm</span>
        </div>
      </label>
      <label className="text-xs font-black text-stone-600">
        일일 권장 섭취 열량
        <div className="mt-1 flex items-center rounded-xl border border-stone-200 px-3">
          <input type="number" min="0" value={recommendedCalories} onChange={(event) => setRecommendedCalories(event.target.value)} className="min-w-0 flex-1 py-3 text-sm outline-none" />
          <span className="text-stone-400">kcal</span>
        </div>
      </label>
      <button disabled={saving} className="rounded-xl bg-stone-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">기준 저장</button>
    </form>
  );
}

const COMPOSITION_FIELDS = [
  ["weightKg", "몸무게", "kg"],
  ["bodyFatPercent", "체지방률", "%"],
  ["skeletalMuscleKg", "골격근량", "kg"],
  ["bmi", "BMI", ""],
  ["bodyFatKg", "체지방량", "kg"],
  ["visceralFatLevel", "내장지방지수", ""],
  ["fatFreeMassKg", "제지방체중", "kg"],
  ["muscleMassKg", "근육량", "kg"],
  ["boneMassKg", "골질량", "kg"],
  ["mineralsKg", "무기질", "kg"],
  ["waistHipRatio", "복부비만율", ""],
  ["bodyWaterPercent", "체수분", "%"],
  ["proteinPercent", "단백질", "%"],
  ["obesityDegreePercent", "비만도", "%"],
  ["bmi2018", "BMI(~2018)", ""],
  ["basalMetabolicRate", "기초대사량", "kcal"],
  ["bodyAge", "신체나이", "세"],
  ["standardWeightKg", "표준체중", "kg"],
] as const;

type CompositionKey = (typeof COMPOSITION_FIELDS)[number][0];
type MeasurementValues = Record<CompositionKey, string> & {
  calories: string;
  carbohydrate: string;
  protein: string;
  fat: string;
  note: string;
};

const emptyMeasurementValues = (): MeasurementValues => ({
  weightKg: "",
  bodyFatPercent: "",
  skeletalMuscleKg: "",
  bmi: "",
  bodyFatKg: "",
  visceralFatLevel: "",
  fatFreeMassKg: "",
  muscleMassKg: "",
  boneMassKg: "",
  mineralsKg: "",
  waistHipRatio: "",
  bodyWaterPercent: "",
  proteinPercent: "",
  obesityDegreePercent: "",
  bmi2018: "",
  basalMetabolicRate: "",
  bodyAge: "",
  standardWeightKg: "",
  calories: "",
  carbohydrate: "",
  protein: "",
  fat: "",
  note: "",
});

function MeasurementForm({
  profile,
  onSaved,
}: {
  profile: HealthProfile;
  onSaved: (item: HealthMeasurement) => void;
}) {
  const [date, setDate] = useState(todayString());
  const [values, setValues] = useState<MeasurementValues>(emptyMeasurementValues);
  const [saving, setSaving] = useState(false);
  const number = (key: keyof MeasurementValues) =>
    values[key] === "" ? undefined : Number(values[key]);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        const result = await saveHealthMeasurementAction({
          date,
          source: "MANUAL",
          heightCm: profile.heightCm,
          ...Object.fromEntries(
            COMPOSITION_FIELDS.map(([key]) => [key, number(key)]),
          ),
          calories: Number(values.calories) || 0,
          carbohydrate: Number(values.carbohydrate) || 0,
          protein: Number(values.protein) || 0,
          fat: Number(values.fat) || 0,
          note: values.note.trim() || undefined,
        });
        setSaving(false);
        if (result.success) onSaved(result.data);
      }}
      className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-stone-950">오늘의 신체·영양 기록</h3>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-stone-200 px-2 py-2 text-xs" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["weightKg", "몸무게", "kg"],
          ["bodyFatPercent", "체지방률", "%"],
          ["skeletalMuscleKg", "골격근량", "kg"],
          ["bmi", "BMI", ""],
          ["calories", "섭취 열량", "kcal"],
          ["carbohydrate", "탄수화물", "g"],
          ["protein", "섭취 단백질", "g"],
          ["fat", "지방", "g"],
        ].map(([key, label, unit]) => (
          <label key={key} className="rounded-2xl bg-stone-50 p-3 text-[10px] font-black text-stone-500">
            {label}
            <div className="mt-1 flex items-end gap-1">
              <input
                type="number"
                min="0"
                step="0.1"
                value={values[key as keyof typeof values]}
                onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                className="min-w-0 flex-1 bg-transparent text-lg font-black text-stone-950 outline-none"
              />
              <span>{unit}</span>
            </div>
          </label>
        ))}
      </div>
      <details className="mt-3 rounded-2xl border border-stone-200">
        <summary className="cursor-pointer px-4 py-3 text-xs font-black text-stone-700">앳플리 체성분 전체 입력</summary>
        <div className="grid grid-cols-2 gap-2 border-t border-stone-100 p-3 sm:grid-cols-3">
          {COMPOSITION_FIELDS.slice(4).map(([key, label, unit]) => (
            <label key={key} className="rounded-xl bg-stone-50 p-3 text-[10px] font-black text-stone-500">
              {label}
              <div className="mt-1 flex items-end gap-1">
                <input
                  type="number"
                  min={key === "obesityDegreePercent" ? undefined : "0"}
                  step="0.1"
                  value={values[key]}
                  onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                  className="min-w-0 flex-1 bg-transparent text-base font-black text-stone-950 outline-none"
                />
                <span>{unit}</span>
              </div>
            </label>
          ))}
        </div>
      </details>
      <textarea value={values.note} onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))} placeholder="컨디션이나 특이사항" rows={2} className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm" />
      <button disabled={saving} className="mt-3 w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">기록 저장</button>
    </form>
  );
}

function MeasurementHistory({ measurements }: { measurements: HealthMeasurement[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-stone-950">최근 변화</h3>
      <div className="scrollbar-hidden mt-3 max-h-80 space-y-2 overflow-y-auto">
        {measurements.length === 0 ? <p className="py-8 text-center text-sm text-stone-400">아직 기록이 없습니다.</p> : measurements.slice(0, 30).map((item) => (
          <div key={item.id} className="grid grid-cols-[90px_1fr] gap-3 rounded-2xl bg-stone-50 p-3">
            <strong className="text-xs text-stone-700">{item.date}</strong>
            <div>
              <p className="text-xs font-bold text-stone-700">
                {item.weightKg ? `${item.weightKg}kg` : "체중 미입력"}
                {item.bodyFatPercent !== undefined ? ` · 체지방 ${item.bodyFatPercent}%` : ""}
                {item.skeletalMuscleKg !== undefined ? ` · 골격근 ${item.skeletalMuscleKg}kg` : ""}
                {item.bmi !== undefined ? ` · BMI ${item.bmi}` : ""}
              </p>
              <p className="mt-1 text-[10px] text-stone-500">
                {item.calories}kcal · 탄 {item.carbohydrate}g / 단 {item.protein}g / 지 {item.fat}g
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CareRoutineForm({ onSaved }: { onSaved: (item: CareRoutine) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CareRoutine["kind"]>("MEDICATION");
  const [time, setTime] = useState("09:00");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || saving) return;
        setSaving(true);
        const result = await saveCareRoutineAction({
          title: title.trim(),
          kind,
          times: [time],
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startDate: todayString(),
          instructions: instructions.trim() || undefined,
          active: true,
        });
        setSaving(false);
        if (result.success) {
          onSaved(result.data);
          setTitle("");
          setInstructions("");
        }
      }}
      className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-base font-black text-stone-950">반복 돌봄 추가</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select value={kind} onChange={(event) => setKind(event.target.value as CareRoutine["kind"])} className="rounded-xl border border-stone-200 p-3 text-sm">
          <option value="MEDICATION">복약</option>
          <option value="TREATMENT">처치</option>
          <option value="CHECK">측정·점검</option>
          <option value="CUSTOM">기타</option>
        </select>
        <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="rounded-xl border border-stone-200 p-3 text-sm" />
      </div>
      <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 혈압약 복용, 밴드 교체" className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm" />
      <input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="용량·주의사항·조치 방법" className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm" />
      <button disabled={saving || !title.trim()} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">알림 루틴 등록</button>
    </form>
  );
}

function CareRoutineList({
  routines,
  onChanged,
}: {
  routines: CareRoutine[];
  onChanged: (item: CareRoutine) => void;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-stone-950">돌봄 루틴</h3>
      <div className="mt-3 space-y-2">
        {routines.length === 0 ? <p className="py-8 text-center text-sm text-stone-400">등록된 루틴이 없습니다.</p> : routines.map((routine) => (
          <div key={routine.id} className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-stone-900">{routine.title}</p>
              <p className="text-[10px] text-stone-500">{routine.times.join(", ")} · {routine.kind}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const result = await saveCareRoutineAction({ ...routine, active: !routine.active });
                if (result.success) onChanged(result.data);
              }}
              aria-pressed={routine.active}
              className={`rounded-full px-3 py-1.5 text-[10px] font-black ${routine.active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-500"}`}
            >
              {routine.active ? "알림 중" : "중지됨"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
