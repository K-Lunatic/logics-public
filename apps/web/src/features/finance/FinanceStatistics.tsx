"use client";

import { useMemo, useState } from "react";
import { getFinanceStatisticsAction } from "@ink/assembler";
import type { FinanceBook, FinanceTransaction } from "@ink/engine";

export function FinanceStatistics({ book }: { book: FinanceBook }) {
  const [startDate, setStartDate] = useState(`${book.month}-01`);
  const [endDate, setEndDate] = useState(() => {
    const [year, month] = book.month.split("-").map(Number);
    return `${book.month}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  });
  const [transactions, setTransactions] = useState<FinanceTransaction[]>(book.transactions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const expenses = transactions.filter((item) => item.type === "EXPENSE");
  const income = transactions.filter((item) => item.type === "INCOME").reduce((sum, item) => sum + item.amount, 0);
  const expense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const categories = useMemo(
    () => [...expenses.reduce(
      (map, item) => map.set(item.category, (map.get(item.category) || 0) + item.amount),
      new Map<string, number>(),
    )].sort((left, right) => right[1] - left[1]),
    [expenses],
  );
  const max = categories[0]?.[1] || 1;

  const search = async () => {
    setLoading(true);
    setError("");
    try {
      setTransactions(await getFinanceStatisticsAction(startDate, endDate));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "통계를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-bold text-stone-500">
          시작일
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="finance-input mt-1.5" />
        </label>
        <label className="text-xs font-bold text-stone-500">
          종료일
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="finance-input mt-1.5" />
        </label>
        <button type="button" onClick={() => void search()} disabled={loading} className="self-end rounded-xl bg-stone-950 px-5 py-3 text-sm font-bold text-white disabled:bg-stone-300">
          {loading ? "조회 중" : "기간 조회"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="수입" value={income} className="text-emerald-600" />
        <Metric label="지출" value={expense} className="text-rose-600" />
        <Metric label="합계" value={income - expense} className="text-stone-800" />
      </div>
      <section>
        <h3 className="mb-4 text-sm font-black text-stone-800">분류별 지출</h3>
        {categories.length === 0 ? (
          <p className="rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-400">선택한 기간에 지출이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {categories.map(([name, value]) => (
              <div key={name}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <strong>{name}</strong>
                  <span>₩{value.toLocaleString()} · {Math.round(value / expense * 100)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${value / max * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <p className="text-xs font-bold text-stone-400">{label}</p>
      <p className={`mt-1 text-sm font-black sm:text-lg ${className}`}>₩{value.toLocaleString()}</p>
    </div>
  );
}
