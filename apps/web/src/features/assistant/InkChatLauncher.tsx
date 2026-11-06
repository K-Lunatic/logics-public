"use client";

import { useEffect } from "react";
import { PenTool } from "lucide-react";
import { useInkChatSettings } from "@/context/InkChatSettingsProvider";
import { InkChat } from "./InkChat";

export function InkChatLauncher() {
  const { isChatOpen, setIsChatOpen } = useInkChatSettings();

  useEffect(() => {
    if (!isChatOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsChatOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isChatOpen, setIsChatOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsChatOpen(true)}
        aria-label="Ink AI 열기"
        aria-expanded={isChatOpen}
        className={`fixed bottom-24 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-stone-950 text-white shadow-2xl transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900 md:bottom-7 md:right-7 ${
          isChatOpen ? "pointer-events-none scale-90 opacity-0" : ""
        }`}
      >
        <PenTool aria-hidden="true" size={23} strokeWidth={1.8} />
      </button>

      {isChatOpen && (
        <div className="fixed inset-0 z-[60]">
          <div aria-hidden="true" className="ink-bloom fixed bottom-24 right-5 md:bottom-7 md:right-7" />
          <button
            type="button"
            aria-label="AI 대화 닫기"
            onClick={() => setIsChatOpen(false)}
            className="absolute inset-0 bg-stone-950/35 backdrop-blur-[2px]"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Ink AI 대화"
            className="ink-dialog-enter absolute inset-x-3 bottom-3 top-16 mx-auto max-w-3xl md:inset-x-8 md:bottom-7 md:top-20"
          >
            <InkChat onClose={() => setIsChatOpen(false)} />
          </section>
        </div>
      )}
    </>
  );
}
