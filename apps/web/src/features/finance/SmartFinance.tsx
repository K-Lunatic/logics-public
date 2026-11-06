"use client";

import { useCallback, useState } from "react";
import { getFinanceBookAction, useDataStore } from "@ink/assembler";
import type { FinanceBook } from "@ink/engine";
import { FinanceLedgerView } from "./FinanceLedgerView";
import { FinanceStatistics } from "./FinanceStatistics";
import { FinanceAssets } from "./FinanceAssets";

type FinanceSection = "LEDGER" | "STATISTICS" | "ASSETS";

function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthValue] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthValue - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function SmartFinance() {
  const [month, setMonth] = useState(currentMonth);
  const [section, setSection] = useState<FinanceSection>("LEDGER");
  const fetchBook = useCallback(() => getFinanceBookAction(month), [month]);
  const { data, updateData, loading } = useDataStore<FinanceBook>({
    key: `finance:${month}`,
    fetcher: fetchBook,
  });

  const reload = useCallback(async () => {
    const latest = await getFinanceBookAction(month);
    await updateData(latest);
  }, [month, updateData]);

  return (
    <section className="space-y-4">
      <header className="rounded-[28px] bg-stone-950 p-5 text-white sm:p-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
            aria-label="이전 달"
            className="rounded-full bg-white/10 px-4 py-2 text-lg"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.18em] text-white/45">MY FINANCE</p>
            <h2 className="mt-1 text-xl font-black">
              {Number(month.slice(0, 4))}년 {Number(month.slice(5))}월
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
            aria-label="다음 달"
            className="rounded-full bg-white/10 px-4 py-2 text-lg"
          >
            ›
          </button>
        </div>
        <nav aria-label="재무 기능" className="mt-5 grid grid-cols-3 gap-2">
          {([
            ["LEDGER", "가계부"],
            ["STATISTICS", "통계"],
            ["ASSETS", "자산"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`rounded-xl py-2.5 text-sm font-bold ${
                section === id ? "bg-white text-stone-950" : "bg-white/8 text-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {loading && !data ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-400">
          재무 장부를 불러오는 중...
        </div>
      ) : data ? (
        <>
          {section === "LEDGER" && (
            <FinanceLedgerView key={month} book={data} onBookChange={updateData} onReload={reload} />
          )}
          {section === "STATISTICS" && <FinanceStatistics key={month} book={data} />}
          {section === "ASSETS" && (
            <FinanceAssets
              key={month}
              book={data}
              onBookChange={updateData}
              onReload={reload}
            />
          )}
        </>
      ) : (
        <p className="rounded-3xl bg-rose-50 p-6 text-sm text-rose-700">
          재무 장부를 불러오지 못했습니다.
        </p>
      )}
    </section>
  );
}
