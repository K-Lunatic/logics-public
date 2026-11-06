"use client";

import { useMemo, useState } from "react";
import {
  createFinanceTransactionAction,
  deleteFinanceMemoAction,
  deleteFinanceTransactionAction,
  saveFinanceBudgetAction,
  saveFinanceMemoAction,
  saveFinancePreferencesAction,
  updateFinanceTransactionAction,
} from "@ink/assembler";
import type { FinanceBook, FinanceTransaction } from "@ink/engine";

type LedgerView = "DAILY" | "CALENDAR" | "MONTHLY" | "SUMMARY" | "MEMO";

interface FinanceLedgerViewProps {
  book: FinanceBook;
  onBookChange: (book: FinanceBook) => Promise<void>;
  onReload: () => Promise<void>;
}

export function FinanceLedgerView({
  book,
  onBookChange,
  onReload,
}: FinanceLedgerViewProps) {
  const [view, setView] = useState<LedgerView>("DAILY");

  return (
    <div className="rounded-[28px] border border-stone-200 bg-white shadow-sm">
      <nav aria-label="가계부 보기" className="grid grid-cols-5 gap-1 border-b border-stone-100 p-2">
        {([
          ["DAILY", "일일"],
          ["CALENDAR", "달력"],
          ["MONTHLY", "월별"],
          ["SUMMARY", "요약"],
          ["MEMO", "메모"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-xl py-2.5 text-xs font-bold sm:text-sm ${
              view === id ? "bg-stone-950 text-white" : "text-stone-400 hover:bg-stone-50"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="p-4 sm:p-6">
        {view === "DAILY" && (
          <DailyEntry book={book} onBookChange={onBookChange} onReload={onReload} />
        )}
        {view === "CALENDAR" && <MonthlyCalendar book={book} />}
        {view === "MONTHLY" && (
          <MonthlyList book={book} onBookChange={onBookChange} onReload={onReload} />
        )}
        {view === "SUMMARY" && (
          <FinanceSummary book={book} onBookChange={onBookChange} />
        )}
        {view === "MEMO" && <FinanceMemos book={book} onBookChange={onBookChange} />}
      </div>
    </div>
  );
}

function DailyEntry({
  book,
  onReload,
  onBookChange,
}: FinanceLedgerViewProps) {
  const [form, setForm] = useState({
    type: "EXPENSE" as FinanceTransaction["type"],
    date: `${book.month}-01`,
    amount: "",
    category: book.categories[0] || "기타",
    assetAccount: book.assetCategories[0] || "현금",
    description: "",
    isFixed: false,
    schedule: "NONE" as "NONE" | "REPEAT" | "INSTALLMENT",
    months: 2,
  });
  const [extraFields, setExtraFields] = useState<Array<{ label: string; value: string }>>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newAssetCategory, setNewAssetCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const accountOptions = [...new Set([
    ...book.assets.map((asset) => asset.name),
    ...book.assetCategories,
  ])];

  const addPreference = async (kind: "category" | "asset") => {
    const value = (kind === "category" ? newCategory : newAssetCategory).trim();
    if (!value) return;
    const preferences = {
      categories: kind === "category" ? [...new Set([...book.categories, value])] : book.categories,
      assetCategories:
        kind === "asset" ? [...new Set([...book.assetCategories, value])] : book.assetCategories,
    };
    await saveFinancePreferencesAction(preferences);
    await onBookChange({ ...book, ...preferences });
    if (kind === "category") {
      setForm({ ...form, category: value });
      setNewCategory("");
    } else {
      setForm({ ...form, assetAccount: value });
      setNewAssetCategory("");
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("itemId", `finance_${Date.now()}`);
    setMessage("이미지를 업로드하는 중...");
    const response = await fetch("/api/upload/drive", { method: "POST", body });
    const result = await response.json();
    if (!response.ok || !result.imageUrl) {
      setMessage(result.error || "이미지를 업로드하지 못했습니다.");
      return;
    }
    setImageUrl(result.imageUrl);
    setMessage("이미지를 첨부했습니다.");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      await createFinanceTransactionAction({
        type: form.type,
        date: form.date,
        amount: Number(form.amount),
        category: form.category,
        assetAccount: form.assetAccount,
        description: form.description,
        isFixed: form.isFixed,
        recurrence: form.schedule === "REPEAT" ? "MONTHLY" : "NONE",
        repeatMonths: form.schedule === "REPEAT" ? form.months : 1,
        installmentMonths: form.schedule === "INSTALLMENT" ? form.months : 1,
        extraFields: extraFields.filter((item) => item.label.trim() && item.value.trim()),
        imageUrl: imageUrl || undefined,
      });
      setForm({ ...form, amount: "", description: "", isFixed: false, schedule: "NONE" });
      setExtraFields([]);
      setImageUrl("");
      setMessage("내역을 추가했습니다.");
      await onReload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "내역을 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["EXPENSE", "INCOME"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setForm({ ...form, type })}
            className={`rounded-xl border py-3 text-sm font-black ${
              form.type === type
                ? type === "EXPENSE"
                  ? "border-rose-500 bg-rose-50 text-rose-700"
                  : "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-stone-200 text-stone-400"
            }`}
          >
            {type === "EXPENSE" ? "지출" : "수입"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="날짜">
          <input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="finance-input" />
        </Field>
        <Field label="금액">
          <input type="number" min="1" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" className="finance-input" />
        </Field>
        <Field label="분류">
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="finance-input">
            {book.categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </Field>
        <Field label="자산">
          <select value={form.assetAccount} onChange={(event) => setForm({ ...form, assetAccount: event.target.value })} className="finance-input">
            {accountOptions.map((account) => <option key={account}>{account}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <InlineAdd value={newCategory} onChange={setNewCategory} onAdd={() => void addPreference("category")} placeholder="지출 분류 추가" />
        <InlineAdd value={newAssetCategory} onChange={setNewAssetCategory} onAdd={() => void addPreference("asset")} placeholder="자산 분류 추가" />
      </div>

      <Field label="내용">
        <input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="어디에 사용했나요?" className="finance-input" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="반복·할부">
          <select value={form.schedule} onChange={(event) => setForm({ ...form, schedule: event.target.value as typeof form.schedule })} className="finance-input">
            <option value="NONE">일회성</option>
            <option value="REPEAT">매월 반복</option>
            <option value="INSTALLMENT">할부</option>
          </select>
        </Field>
        {form.schedule !== "NONE" && (
          <Field label={form.schedule === "REPEAT" ? "반복 개월" : "할부 개월"}>
            <input type="number" min="2" max="24" value={form.months} onChange={(event) => setForm({ ...form, months: Number(event.target.value) })} className="finance-input" />
          </Field>
        )}
      </div>
      {form.type === "EXPENSE" && (
        <label className="flex items-center gap-2 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
          <input type="checkbox" checked={form.isFixed} onChange={(event) => setForm({ ...form, isFixed: event.target.checked })} />
          고정지출로 분류
        </label>
      )}

      <div className="space-y-2">
        {extraFields.map((field, index) => (
          <div key={`extra-${index}`} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
            <input value={field.label} onChange={(event) => setExtraFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="항목명" className="finance-input" />
            <input value={field.value} onChange={(event) => setExtraFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="추가 내용" className="finance-input" />
            <button type="button" onClick={() => setExtraFields((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl bg-stone-100 px-3 text-stone-500">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setExtraFields((items) => [...items, { label: "", value: "" }])} className="text-xs font-bold text-stone-500">
          + 추가 입력 항목
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-600">
          📎 이미지 첨부
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => void uploadImage(event.target.files?.[0])} />
        </label>
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-600 underline">
            첨부 이미지 확인
          </a>
        )}
      </div>
      {message && <p role="status" className="text-sm text-stone-500">{message}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-2xl bg-stone-950 py-3.5 text-sm font-black text-white disabled:bg-stone-300">
        {saving ? "저장 중..." : "내역 추가"}
      </button>
    </form>
  );
}

function MonthlyCalendar({ book }: { book: FinanceBook }) {
  const [year, month] = book.month.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const totals = useMemo(() => {
    const map = new Map<number, { income: number; expense: number }>();
    book.transactions.forEach((item) => {
      const day = Number(item.date.slice(-2));
      const current = map.get(day) || { income: 0, expense: 0 };
      current[item.type === "INCOME" ? "income" : "expense"] += item.amount;
      map.set(day, current);
    });
    return map;
  }, [book.transactions]);
  const income = book.transactions.filter((item) => item.type === "INCOME").reduce((sum, item) => sum + item.amount, 0);
  const expense = book.transactions.filter((item) => item.type === "EXPENSE").reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-4">
      <SummaryStrip income={income} expense={expense} />
      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-stone-400">
        {"일월화수목금토".split("").map((day) => <span key={day} className="py-2">{day}</span>)}
        {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const value = totals.get(day);
          return (
            <div key={day} className="min-h-20 border-t border-stone-100 px-1 py-2 sm:min-h-24">
              <strong className="text-xs text-stone-700">{day}</strong>
              {value?.income ? <p className="mt-1 truncate text-[9px] text-emerald-600">+{compactMoney(value.income)}</p> : null}
              {value?.expense ? <p className="truncate text-[9px] text-rose-600">-{compactMoney(value.expense)}</p> : null}
              {value ? <p className="truncate text-[9px] font-bold text-stone-500">{compactMoney(value.income - value.expense)}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthlyList({
  book,
  onReload,
}: FinanceLedgerViewProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"ALL" | FinanceTransaction["type"]>("ALL");
  const visible = book.transactions.filter((item) =>
    (type === "ALL" || item.type === type) &&
    `${item.description} ${item.category} ${item.assetAccount}`
      .toLocaleLowerCase("ko-KR")
      .includes(query.trim().toLocaleLowerCase("ko-KR"))
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="내용·분류·자산 검색" className="finance-input" />
        <select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="finance-input">
          <option value="ALL">전체 내역</option>
          <option value="EXPENSE">지출</option>
          <option value="INCOME">수입</option>
        </select>
      </div>
      {visible.length === 0 ? <Empty text="조건에 맞는 내역이 없습니다." /> : visible.map((item) => (
        <TransactionRow key={item.id} item={item} book={book} onReload={onReload} />
      ))}
    </div>
  );
}

function TransactionRow({
  item,
  book,
  onReload,
}: {
  item: FinanceTransaction;
  book: FinanceBook;
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: item.date,
    amount: String(item.amount),
    category: item.category,
    assetAccount: item.assetAccount,
    description: item.description,
  });
  const hasSeries = Boolean(item.recurrenceGroupId);
  const accountOptions = [...new Set([
    ...book.assets.map((asset) => asset.name),
    ...book.assetCategories,
    item.assetAccount,
  ])];

  const save = async (scope: "ONE" | "SERIES") => {
    if (saving) return;
    setSaving(true);
    try {
      await updateFinanceTransactionAction(item.id, {
        date: form.date,
        amount: Number(form.amount),
        category: form.category,
        assetAccount: form.assetAccount,
        description: form.description,
      }, scope);
      await onReload();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (scope: "ONE" | "SERIES") => {
    if (saving || !window.confirm(scope === "SERIES" ? "이 반복·할부 묶음 전체를 삭제할까요?" : "이 내역을 삭제할까요?")) return;
    setSaving(true);
    try {
      await deleteFinanceTransactionAction(item.id, scope);
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <article className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="finance-input" />
          <input type="number" min="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="finance-input" />
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="finance-input">
            {book.categories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <select value={form.assetAccount} onChange={(event) => setForm({ ...form, assetAccount: event.target.value })} className="finance-input">
            {accountOptions.map((account) => <option key={account}>{account}</option>)}
          </select>
        </div>
        <input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="finance-input" />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-stone-500">취소</button>
          <button type="button" disabled={saving} onClick={() => void save("ONE")} className="rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white">이 내역 저장</button>
          {hasSeries && (
            <button type="button" disabled={saving} onClick={() => void save("SERIES")} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white">묶음 전체 저장</button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 p-4">
      <div className="min-w-0">
        <strong className="block truncate text-sm text-stone-800">{item.description}</strong>
        <p className="mt-1 text-xs text-stone-400">
          {item.date} · {item.category} · {item.assetAccount}
          {item.installmentTotal ? ` · ${item.installmentIndex}/${item.installmentTotal}회` : ""}
          {item.recurrence === "MONTHLY" ? " · 반복" : ""}
        </p>
        {item.imageUrl && (
          <a href={item.imageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold text-violet-600 underline">
            첨부 이미지
          </a>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-black ${item.type === "INCOME" ? "text-emerald-600" : "text-rose-600"}`}>
          {item.type === "INCOME" ? "+" : "-"}₩{item.amount.toLocaleString()}
        </p>
        <div className="mt-1 flex justify-end gap-2 text-xs">
          <button type="button" onClick={() => setEditing(true)} className="text-stone-500 hover:text-stone-900">수정</button>
          <button type="button" disabled={saving} onClick={() => void remove("ONE")} className="text-stone-400 hover:text-rose-600">삭제</button>
          {hasSeries && (
            <button type="button" disabled={saving} onClick={() => void remove("SERIES")} className="text-rose-500">묶음 삭제</button>
          )}
        </div>
      </div>
    </article>
  );
}

function FinanceSummary({
  book,
  onBookChange,
}: Pick<FinanceLedgerViewProps, "book" | "onBookChange">) {
  const [budget, setBudget] = useState(String(book.monthlyBudget || ""));
  const expenses = book.transactions.filter((item) => item.type === "EXPENSE");
  const expense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const rate = book.monthlyBudget ? Math.min(100, Math.round(expense / book.monthlyBudget * 100)) : 0;
  const categories = [...expenses.reduce((map, item) => map.set(item.category, (map.get(item.category) || 0) + item.amount), new Map<string, number>())]
    .sort((left, right) => right[1] - left[1]);
  const max = categories[0]?.[1] || 1;
  const saveBudget = async () => {
    const value = Math.max(0, Number(budget));
    await saveFinanceBudgetAction(book.month, value);
    await onBookChange({ ...book, monthlyBudget: value });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex justify-between text-sm font-bold">
          <span>월 예산 ₩{book.monthlyBudget.toLocaleString()}</span>
          <span>{rate}% 사용</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-stone-100">
          <div className={`h-full rounded-full ${rate >= 80 ? "bg-rose-500" : "bg-stone-900"}`} style={{ width: `${rate}%` }} />
        </div>
        <div className="mt-3 flex gap-2">
          <input type="number" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="월 예산" className="finance-input flex-1" />
          <button type="button" onClick={() => void saveBudget()} className="rounded-xl bg-stone-950 px-4 text-sm font-bold text-white">저장</button>
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-black">분류별 지출 내역</h3>
        <div className="space-y-3">
          {categories.length === 0 ? <Empty text="지출 내역이 없습니다." /> : categories.map(([name, value]) => (
            <div key={name}>
              <div className="mb-1 flex justify-between text-xs"><strong>{name}</strong><span>₩{value.toLocaleString()}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-rose-500" style={{ width: `${value / max * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FinanceMemos({
  book,
  onBookChange,
}: Pick<FinanceLedgerViewProps, "book" | "onBookChange">) {
  const [date, setDate] = useState(`${book.month}-01`);
  const [text, setText] = useState("");
  const add = async () => {
    if (!text.trim()) return;
    const memo = { id: `memo_${crypto.randomUUID()}`, date, text: text.trim(), createdAt: new Date().toISOString() };
    const memos = await saveFinanceMemoAction(book.month, memo);
    await onBookChange({ ...book, memos });
    setText("");
  };
  const remove = async (id: string) => {
    const memos = await deleteFinanceMemoAction(book.month, id);
    await onBookChange({ ...book, memos });
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
        <input type="date" min={`${book.month}-01`} max={`${book.month}-31`} value={date} onChange={(event) => setDate(event.target.value)} className="finance-input" />
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="날짜별 메모" className="finance-input" />
        <button type="button" onClick={() => void add()} className="rounded-xl bg-stone-950 px-5 py-3 text-sm font-bold text-white">추가</button>
      </div>
      {book.memos.length === 0 ? <Empty text="작성된 메모가 없습니다." /> : book.memos
        .slice()
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((memo) => (
          <article key={memo.id} className="flex justify-between gap-3 rounded-2xl bg-amber-50 p-4">
            <div><p className="text-xs font-bold text-amber-700">{memo.date}</p><p className="mt-1 text-sm text-stone-700">{memo.text}</p></div>
            <button type="button" onClick={() => void remove(memo.id)} className="text-xs text-stone-400">삭제</button>
          </article>
        ))}
    </div>
  );
}

function SummaryStrip({ income, expense }: { income: number; expense: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-stone-50 p-3 text-center">
      <SummaryValue label="수입" value={income} className="text-emerald-600" />
      <SummaryValue label="지출" value={expense} className="text-rose-600" />
      <SummaryValue label="합계" value={income - expense} className="text-stone-800" />
    </div>
  );
}

function SummaryValue({ label, value, className }: { label: string; value: number; className: string }) {
  return <div><p className="text-[10px] font-bold text-stone-400">{label}</p><p className={`mt-1 text-xs font-black sm:text-sm ${className}`}>₩{value.toLocaleString()}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-stone-500">{label}<span className="mt-1.5 block">{children}</span></label>;
}

function InlineAdd({ value, onChange, onAdd, placeholder }: { value: string; onChange: (value: string) => void; onAdd: () => void; placeholder: string }) {
  return <div className="flex gap-2"><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="finance-input min-w-0 flex-1" /><button type="button" onClick={onAdd} className="rounded-xl bg-stone-100 px-3 text-xs font-bold">추가</button></div>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-stone-50 p-6 text-center text-sm text-stone-400">{text}</p>;
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
