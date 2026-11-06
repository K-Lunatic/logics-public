"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  deleteMealPlanAction,
  estimateMealNutritionAction,
  listMealFeedbackAction,
  organizeMealRecipeAction,
  saveMealFeedbackAction,
  saveMealPlanAction,
  type CalendarEvent,
} from "@ink/assembler";
import type { FinanceTransaction, MealPlan } from "@ink/engine";

export type CalendarLayer = "ALL" | "SCHEDULE" | "FINANCE" | "MEAL";
export type MealPeriod = "MONTH" | "TWO_WEEKS" | "WEEK" | "DAY";

const MEAL_LABEL = {
  BREAKFAST: "아침",
  LUNCH: "점심",
  DINNER: "저녁",
  SNACK: "간식",
} as const;

const SOURCE_LABEL = {
  HOME: "직접 조리",
  RESTAURANT: "식당",
  DELIVERY: "배달",
} as const;

const dateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function rangeDates(selectedDate: string, period: MealPeriod) {
  const selected = new Date(`${selectedDate}T12:00:00`);
  if (period === "DAY") return [selectedDate];
  const count = period === "TWO_WEEKS" ? 14 : 7;
  const mondayOffset = (selected.getDay() + 6) % 7;
  selected.setDate(selected.getDate() - mondayOffset);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(selected);
    date.setDate(selected.getDate() + index);
    return dateString(date);
  });
}

export function MealRangeView({
  selectedDate,
  period,
  meals,
  onSelectDate,
}: {
  selectedDate: string;
  period: Exclude<MealPeriod, "MONTH">;
  meals: MealPlan[];
  onSelectDate: (date: string) => void;
}) {
  const dates = rangeDates(selectedDate, period);
  return (
    <div className="scrollbar-hidden grid min-h-[520px] auto-rows-min gap-3 overflow-y-auto bg-stone-50 p-3 sm:grid-cols-2 xl:grid-cols-3">
      {dates.map((date) => {
        const dayMeals = meals.filter((meal) => meal.date === date);
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelectDate(date)}
            className={`min-h-36 rounded-2xl border bg-white p-4 text-left shadow-sm ${
              selectedDate === date ? "border-stone-950 ring-1 ring-stone-950" : "border-stone-200"
            }`}
          >
            <p className="text-xs font-black text-stone-500">
              {new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </p>
            <div className="mt-3 space-y-2">
              {dayMeals.length === 0 ? (
                <p className="text-xs text-stone-400">식단을 추가해 주세요.</p>
              ) : dayMeals.map((meal) => (
                <div key={meal.id} className="rounded-xl bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] font-black text-emerald-700">
                    {MEAL_LABEL[meal.mealType]} · {SOURCE_LABEL[meal.sourceType]}
                  </p>
                  <p className="truncate text-sm font-black text-stone-900">{meal.title}</p>
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function DayOverviewPanel({
  date,
  layer,
  schedules,
  transactions,
  meals,
  onAddSchedule,
  onEditSchedule,
  onMealsChanged,
}: {
  date: string;
  layer: CalendarLayer;
  schedules: CalendarEvent[];
  transactions: FinanceTransaction[];
  meals: MealPlan[];
  onAddSchedule: () => void;
  onEditSchedule: (event: CalendarEvent) => void;
  onMealsChanged: (meal?: MealPlan, deletedId?: string) => void;
}) {
  const showSchedule = layer === "ALL" || layer === "SCHEDULE";
  const showFinance = layer === "ALL" || layer === "FINANCE";
  const showMeals = layer === "ALL" || layer === "MEAL";

  return (
    <div className="scrollbar-hidden h-full overflow-y-auto bg-stone-50 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Day detail</p>
          <h3 className="text-lg font-black text-stone-950">{date}</h3>
        </div>
        {showSchedule && (
          <button type="button" onClick={onAddSchedule} className="rounded-xl bg-stone-950 px-3 py-2 text-xs font-black text-white">
            일정 추가
          </button>
        )}
      </header>

      <div className="space-y-4">
        {showMeals && (
          <MealSection date={date} meals={meals} onChanged={onMealsChanged} />
        )}
        {showSchedule && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h4 className="text-xs font-black text-blue-700">일정 {schedules.length}건</h4>
            <div className="mt-3 space-y-2">
              {schedules.length === 0 ? <Empty /> : schedules.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onEditSchedule(event)}
                  className="block w-full rounded-xl bg-blue-50 px-3 py-2 text-left"
                >
                  <p className="text-sm font-black text-stone-900">{event.title}</p>
                  <p className="text-[10px] text-stone-500">{event.startTime || "종일"} · 수정하려면 선택</p>
                </button>
              ))}
            </div>
          </section>
        )}
        {showFinance && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h4 className="text-xs font-black text-amber-700">재무 {transactions.length}건</h4>
            <div className="mt-3 space-y-2">
              {transactions.length === 0 ? <Empty /> : transactions.map((transaction) => (
                <div key={transaction.id} className="flex justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-stone-900">{transaction.description}</p>
                    <p className="text-[10px] text-stone-500">{transaction.category}</p>
                  </div>
                  <strong className={transaction.type === "INCOME" ? "text-emerald-600" : "text-rose-600"}>
                    {transaction.type === "INCOME" ? "+" : "-"}{transaction.amount.toLocaleString()}원
                  </strong>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <p className="py-3 text-center text-xs text-stone-400">기록이 없습니다.</p>;
}

function MealSection({
  date,
  meals,
  onChanged,
}: {
  date: string;
  meals: MealPlan[];
  onChanged: (meal?: MealPlan, deletedId?: string) => void;
}) {
  const [editing, setEditing] = useState<MealPlan | null | "NEW">(null);
  const [selected, setSelected] = useState<MealPlan | null>(null);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-black text-emerald-700">식단 {meals.length}건</h4>
          <p className="mt-0.5 text-[10px] text-stone-400">학교 식단표처럼 하루의 끼니를 한눈에 정리합니다.</p>
        </div>
        <button type="button" onClick={() => setEditing("NEW")} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white">
          식단 추가
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {meals.length === 0 ? <Empty /> : meals.map((meal) => (
          <button key={meal.id} type="button" onClick={() => setSelected(meal)} className="flex w-full gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-left">
            {meal.imageUrl && (
              <span
                role="img"
                aria-label={`${meal.title} 대표 이미지`}
                className="h-16 w-16 shrink-0 rounded-lg bg-cover bg-center"
                style={{ backgroundImage: `url("${meal.imageUrl.replaceAll('"', "%22")}")` }}
              />
            )}
            <span className="min-w-0 flex-1">
            <p className="text-[10px] font-black text-emerald-700">
              {MEAL_LABEL[meal.mealType]} · {SOURCE_LABEL[meal.sourceType]}
            </p>
            <p className="text-sm font-black text-stone-900">{meal.title}</p>
            {meal.sourceType === "HOME" ? (
              <p className="mt-1 text-[10px] text-stone-500">
                {meal.ingredients.length ? `재료 ${meal.ingredients.join(", ")}` : "레시피와 재료를 입력해 주세요."}
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-stone-500">
                {meal.restaurantName || "식당·배달처 정보를 입력해 주세요."}
              </p>
            )}
            <p className="mt-2 text-[10px] font-bold text-stone-600">
              {meal.nutrition.calories}kcal · 탄 {meal.nutrition.carbohydrate}g · 단 {meal.nutrition.protein}g · 지 {meal.nutrition.fat}g
              {meal.nutrition.estimated ? " · 예상값" : ""}
            </p>
            {meal.nutrition.missingInformation?.length ? (
              <p className="mt-1 text-[9px] text-amber-700">
                부족한 정보: {meal.nutrition.missingInformation.join(", ")}
              </p>
            ) : null}
            </span>
          </button>
        ))}
      </div>
      {selected && (
        <MealDetail
          meal={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
        />
      )}
      {editing && (
        <MealForm
          date={date}
          meal={editing === "NEW" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(meal) => {
            onChanged(meal);
            setEditing(null);
          }}
          onDeleted={(id) => {
            onChanged(undefined, id);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function MealDetail({
  meal,
  onClose,
  onEdit,
}: {
  meal: MealPlan;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void listMealFeedbackAction(meal.id).then(([feedback]) => {
      if (!active || !feedback) return;
      setRating(feedback.rating);
      setTags(feedback.tags);
      setComment(feedback.comment || "");
    });
    return () => {
      active = false;
    };
  }, [meal.id]);

  const markdown = meal.sourceType === "HOME"
    ? meal.recipe
    : meal.note;

  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-stone-950/45 sm:items-center sm:justify-center sm:p-5">
      <button type="button" aria-label="식단 상세 닫기" className="absolute inset-0" onClick={onClose} />
      <article className="scrollbar-hidden relative z-10 max-h-[94dvh] w-full overflow-y-auto rounded-t-[30px] bg-stone-50 sm:max-w-3xl sm:rounded-[30px]">
        {meal.imageUrl && (
          <div
            role="img"
            aria-label={`${meal.title} 대표 이미지`}
            className="h-52 w-full bg-cover bg-center sm:h-72"
            style={{ backgroundImage: `url("${meal.imageUrl.replaceAll('"', "%22")}")` }}
          />
        )}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-emerald-700">
              {meal.date} · {MEAL_LABEL[meal.mealType]} · {SOURCE_LABEL[meal.sourceType]}
            </p>
            <h3 className="truncate text-xl font-black text-stone-950">{meal.title}</h3>
          </div>
          <div className="ml-3 flex gap-2">
            <button type="button" onClick={onEdit} className="rounded-xl bg-stone-950 px-4 py-2 text-xs font-black text-white">
              수정
            </button>
            <button type="button" onClick={onClose} className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-black text-stone-600">
              닫기
            </button>
          </div>
        </header>

        <div className="space-y-4 p-4 sm:p-6">
          <section className="grid grid-cols-4 gap-2">
            {([
              ["열량", `${meal.nutrition.calories} kcal`],
              ["탄수화물", `${meal.nutrition.carbohydrate} g`],
              ["단백질", `${meal.nutrition.protein} g`],
              ["지방", `${meal.nutrition.fat} g`],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white p-3 text-center shadow-sm">
                <p className="text-[9px] font-bold text-stone-400">{label}</p>
                <strong className="mt-1 block text-xs text-stone-900 sm:text-sm">{value}</strong>
              </div>
            ))}
          </section>

          {meal.sourceType === "HOME" ? (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              {meal.ingredients.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-black text-stone-500">등록 재료</h4>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {meal.ingredients.map((ingredient) => (
                      <span key={ingredient} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                        {ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {markdown ? (
                <MarkdownDocument markdown={markdown} />
              ) : (
                <p className="py-8 text-center text-sm text-stone-400">정리된 레시피가 없습니다.</p>
              )}
            </section>
          ) : (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <h4 className="text-sm font-black text-stone-900">{meal.restaurantName || "식당·배달처 미정"}</h4>
              {meal.restaurantAddress && <p className="mt-1 text-xs text-stone-500">{meal.restaurantAddress}</p>}
              {meal.orderUrl && (
                <a href={meal.orderUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-black text-emerald-700 underline">
                  주문·매장 페이지 열기
                </a>
              )}
              {markdown && <div className="mt-5"><MarkdownDocument markdown={markdown} /></div>}
            </section>
          )}

          {meal.recipeReferences?.length ? (
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <h4 className="text-xs font-black text-stone-500">외부 참고 자료</h4>
              <div className="mt-2 space-y-2">
                {meal.recipeReferences.map((reference) => (
                  <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-bold text-emerald-700 underline">
                    {reference.sourceType === "YOUTUBE" ? "YouTube · " : ""}{reference.title}
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <h4 className="text-xs font-black text-stone-500">먹어본 뒤 피드백</h4>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" aria-label={`${value}점`} onClick={() => setRating(value)} className={`h-9 w-9 rounded-lg text-lg ${value <= rating ? "bg-amber-100 text-amber-500" : "bg-stone-50 text-stone-300"}`}>
                  ★
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {["맛있음", "다시 먹기", "비쌈", "조리 어려움", "양이 적음", "양이 많음"].map((tag) => (
                <button key={tag} type="button" onClick={() => setTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tags.includes(tag) ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600"}`}>
                  {tag}
                </button>
              ))}
            </div>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} placeholder="다음 식단에 반영할 점" className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-xs" />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                disabled={!rating}
                onClick={async () => {
                  const result = await saveMealFeedbackAction({ mealId: meal.id, rating, tags, comment: comment || undefined });
                  setMessage(result.success ? "피드백을 저장했습니다." : result.error);
                }}
                className="rounded-xl bg-stone-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
              >
                피드백 저장
              </button>
              {message && <p className="text-xs font-bold text-stone-500">{message}</p>}
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-stone max-w-none text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border border-stone-200 bg-stone-100 px-3 py-2 font-black">{children}</th>,
          td: ({ children }) => <td className="border border-stone-200 px-3 py-2 align-top">{children}</td>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 underline">{children}</a>,
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt || ""} className="my-4 max-h-96 w-full rounded-2xl object-cover" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function MealForm({
  date,
  meal,
  onClose,
  onSaved,
  onDeleted,
}: {
  date: string;
  meal?: MealPlan;
  onClose: () => void;
  onSaved: (meal: MealPlan) => void;
  onDeleted: (id: string) => void;
}) {
  const [mealType, setMealType] = useState<MealPlan["mealType"]>(meal?.mealType || "DINNER");
  const [sourceType, setSourceType] = useState<MealPlan["sourceType"]>(meal?.sourceType || "HOME");
  const [title, setTitle] = useState(meal?.title || "");
  const [place, setPlace] = useState(meal?.restaurantName || "");
  const [address, setAddress] = useState(meal?.restaurantAddress || "");
  const [recipe, setRecipe] = useState(meal?.recipe || "");
  const [ingredients, setIngredients] = useState(meal?.ingredients.join(", ") || "");
  const [calories, setCalories] = useState(String(meal?.nutrition.calories || ""));
  const [carbohydrate, setCarbohydrate] = useState(String(meal?.nutrition.carbohydrate || ""));
  const [protein, setProtein] = useState(String(meal?.nutrition.protein || ""));
  const [fat, setFat] = useState(String(meal?.nutrition.fat || ""));
  const [imageUrl, setImageUrl] = useState(meal?.imageUrl || "");
  const [note, setNote] = useState(meal?.note || "");
  const [orderUrl, setOrderUrl] = useState(meal?.orderUrl || "");
  const [organizing, setOrganizing] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    const result = await saveMealPlanAction({
      id: meal?.id,
      date,
      mealType,
      sourceType,
      title: title.trim(),
      restaurantName: sourceType === "HOME" ? undefined : place.trim(),
      restaurantAddress: sourceType === "HOME" ? undefined : address.trim(),
      recipe: sourceType === "HOME" ? recipe.trim() : undefined,
      ingredients: sourceType === "HOME"
        ? ingredients.split(",").map((value) => value.trim()).filter(Boolean)
        : [],
      nutrition: {
        calories: Number(calories) || 0,
        carbohydrate: Number(carbohydrate) || 0,
        protein: Number(protein) || 0,
        fat: Number(fat) || 0,
      },
      note: note.trim() || undefined,
      orderUrl: orderUrl.trim(),
      imageUrl: imageUrl || undefined,
      recipeReferences: meal?.recipeReferences,
    });
    setSaving(false);
    if (!result.success) return setError(result.error);
    onSaved(result.data);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-stone-950/40 sm:items-center sm:justify-center">
      <button type="button" aria-label="식단 편집 닫기" className="absolute inset-0" onClick={onClose} />
      <form onSubmit={submit} className="scrollbar-hidden relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl">
        <h3 className="text-lg font-black text-stone-950">{meal ? "식단 수정" : "식단 추가"}</h3>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <select value={mealType} onChange={(event) => setMealType(event.target.value as MealPlan["mealType"])} className="rounded-xl border border-stone-200 p-3 text-sm">
            {Object.entries(MEAL_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value as MealPlan["sourceType"])} className="rounded-xl border border-stone-200 p-3 text-sm">
            {Object.entries(SOURCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="메뉴 이름" className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm" />
        {sourceType === "HOME" ? (
          <>
            <input value={ingredients} onChange={(event) => setIngredients(event.target.value)} placeholder="재료를 쉼표로 구분" className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm" />
            <textarea
              value={recipe}
              onChange={(event) => setRecipe(event.target.value)}
              placeholder={"Markdown으로 레시피를 작성하세요.\n표: | 재료 | 분량 |\n이미지: ![설명](https://...)"}
              rows={12}
              className="mt-2 w-full rounded-xl border border-stone-200 p-3 font-mono text-xs leading-6"
            />
            <button
              type="button"
              disabled={!title.trim() || organizing}
              onClick={async () => {
                setOrganizing(true);
                setError("");
                setNotice("");
                try {
                  const result = await organizeMealRecipeAction({
                    title: title.trim(),
                    ingredients: ingredients.split(",").map((value) => value.trim()).filter(Boolean),
                    recipe,
                  });
                  setRecipe(result.data.markdown);
                  setIngredients(result.data.ingredients.join(", "));
                  setNotice(result.warning || "레시피를 Markdown으로 정리했습니다.");
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : "레시피를 정리하지 못했습니다.");
                } finally {
                  setOrganizing(false);
                }
              }}
              className="mt-2 w-full rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-40"
            >
              {organizing ? "레시피 정리 중…" : "레시피 Markdown으로 정리"}
            </button>
          </>
        ) : (
          <div className="mt-2 grid gap-2">
            <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="식당 또는 배달처" className="rounded-xl border border-stone-200 p-3 text-sm" />
            <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="주소·지점 정보" className="rounded-xl border border-stone-200 p-3 text-sm" />
            <input type="url" value={orderUrl} onChange={(event) => setOrderUrl(event.target.value)} placeholder="주문·매장 URL" className="rounded-xl border border-stone-200 p-3 text-sm" />
          </div>
        )}
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="상세 메모도 Markdown으로 작성할 수 있습니다." rows={4} className="mt-2 w-full rounded-xl border border-stone-200 p-3 font-mono text-xs" />
        <input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="대표 이미지 URL (선택)" className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm" />
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ["열량 kcal", calories, setCalories],
            ["탄수화물 g", carbohydrate, setCarbohydrate],
            ["단백질 g", protein, setProtein],
            ["지방 g", fat, setFat],
          ] as const).map(([label, value, setter]) => (
            <input key={label} type="number" min="0" value={value} onChange={(event) => setter(event.target.value)} placeholder={label} className="rounded-xl border border-stone-200 p-3 text-xs" />
          ))}
        </div>
        <button
          type="button"
          disabled={!title.trim() || estimating}
          onClick={async () => {
            setEstimating(true);
            setError("");
            const result = await estimateMealNutritionAction({
              title: title.trim(),
              ingredients: ingredients.split(",").map((value) => value.trim()).filter(Boolean),
              recipe: sourceType === "HOME" ? recipe : note,
            });
            setEstimating(false);
            if (!result.success) return setError(result.error);
            setCalories(String(result.data.calories));
            setCarbohydrate(String(result.data.carbohydrate));
            setProtein(String(result.data.protein));
            setFat(String(result.data.fat));
            setNotice(`예상 영양소를 계산했습니다. 신뢰도: ${result.data.confidence}`);
          }}
          className="mt-2 w-full rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 disabled:opacity-40"
        >
          {estimating ? "예상 영양소 계산 중…" : "탄·단·지와 열량 계산"}
        </button>
        {notice && <p className="mt-2 text-xs font-bold text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          {meal && (
            <button
              type="button"
              onClick={async () => {
                const result = await deleteMealPlanAction(meal.id);
                if (result.success) onDeleted(meal.id);
                else setError(result.error);
              }}
              className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-700"
            >
              삭제
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto rounded-xl bg-stone-100 px-4 py-3 text-sm font-black text-stone-600">취소</button>
          <button disabled={saving || !title.trim()} className="rounded-xl bg-stone-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">저장</button>
        </div>
      </form>
    </div>
  );
}
