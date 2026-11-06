"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listPendingCareAction,
  resolveCareOccurrenceAction,
} from "@ink/assembler";
import type { PendingCareOccurrence } from "@ink/engine";

export function MissedCarePrompt({ userId }: { userId: string }) {
  const [pending, setPending] = useState<PendingCareOccurrence[]>([]);
  const [postponed, setPostponed] = useState(false);
  const notified = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!userId) return;
    const occurrences = await listPendingCareAction(new Date().toISOString());
    setPending(occurrences);
    const unseen = occurrences.filter((item) => !notified.current.has(item.id));
    if (
      unseen.length &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification("확인하지 않은 건강 행동이 있어요", {
        body: `${unseen[0].title}${unseen.length > 1 ? ` 외 ${unseen.length - 1}건` : ""}`,
      });
      unseen.forEach((item) => notified.current.add(item.id));
    }
  }, [userId]);

  useEffect(() => {
    queueMicrotask(() => refresh().catch(console.error));
    const timer = window.setInterval(() => refresh().catch(console.error), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const current = pending[0];
  if (!current || postponed) return null;

  const resolve = async (status: "DONE" | "SKIPPED") => {
    const result = await resolveCareOccurrenceAction(
      { id: current.id, routineId: current.routineId, scheduledAt: current.scheduledAt },
      status,
    );
    if (result.success) setPending((items) => items.filter((item) => item.id !== current.id));
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end bg-stone-950/45 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <section role="dialog" aria-modal="true" aria-labelledby="missed-care-title" className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-md">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">확인 대기 {pending.length}건</p>
        <h2 id="missed-care-title" className="mt-2 text-xl font-black text-stone-950">{current.title}</h2>
        <p className="mt-1 text-sm text-stone-500">
          {new Date(current.scheduledAt).toLocaleString("ko-KR")} 예정이었습니다.
        </p>
        {current.instructions && <p className="mt-3 rounded-2xl bg-stone-50 p-3 text-sm text-stone-700">{current.instructions}</p>}
        <p className="mt-4 text-sm font-bold text-stone-800">실제로 조치했나요?</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => resolve("DONE")} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">완료했어요</button>
          <button type="button" onClick={() => resolve("SKIPPED")} className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">하지 않았어요</button>
        </div>
        <button type="button" onClick={() => setPostponed(true)} className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-black text-stone-400">나중에 다시 묻기</button>
      </section>
    </div>
  );
}
