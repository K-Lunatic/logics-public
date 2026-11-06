// AI assistant surface
"use client";

import { useSession } from "next-auth/react";
import { useInkChat } from "@ink/assembler";
import { SendIcon, AssistantMessageRenderer } from "./components";
import { memo, useCallback, useEffect, useState, useRef } from "react";
import { InkFaceLottie, InkCatState } from "@/components/ui/InkFaceLottie";
import { useInkChatSettings } from "@/context/InkChatSettingsProvider";

interface InkChatProps {
  onClose?: () => void;
}

interface ChatBubbleProps {
  message: { role: string; content: string; timestamp?: string | number };
  personaName: string;
  onAction: (payload: string) => void;
}

const ChatBubble = memo(function ChatBubble({
  message,
  personaName,
  onAction,
}: ChatBubbleProps) {
  return (
    <div
      className={`flex max-w-[85%] flex-col sm:max-w-[80%] ${
        message.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
      }`}
    >
      <span className={`mb-1.5 block text-[9px] font-mono tracking-widest ${message.role === "user" ? "text-stone-400" : "font-bold text-stone-800"}`}>
        {message.role === "user" ? "YOU" : personaName.toUpperCase()}
      </span>
      <div
        className={`rounded-2xl border px-4 py-3 text-[13px] leading-relaxed shadow-sm sm:text-sm ${
          message.role === "user"
            ? "rounded-tr-sm border-stone-800 bg-stone-800 text-white"
            : "rounded-tl-sm border-stone-200/60 bg-white text-stone-800"
        }`}
      >
        {message.role === "user" ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <AssistantMessageRenderer
            content={message.content}
            onActionTrigger={onAction}
          />
        )}
      </div>
      {message.timestamp && (
        <span className="mt-1.5 px-1 text-[9px] font-mono text-stone-300">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );
});

export function InkChat({ onClose }: InkChatProps) {
  const { status } = useSession();
  const [input, setInput] = useState("");
  const { setIsSettingsOpen, setIsToolBuilderOpen, persona } = useInkChatSettings();

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const inputRef = useRef("");
  const isSubmittingRef = useRef(false);
  const { chatHistory, isLoading, sendMessage, isSending, error, progress } = useInkChat({
    personaSettings: persona,
  });

  const showInitialLoading = isLoading && chatHistory.length === 0;

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // 🚀 메시지 발송 핸들러
  const handleSendMessage = useCallback(async (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e) e.preventDefault();

    const textToSend = inputRef.current.trim();
    if (!textToSend || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    shouldStickToBottomRef.current = true;
    setInput("");
    inputRef.current = "";

    try {
      await sendMessage(textToSend);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [sendMessage]);

  const handleAction = useCallback(
    (payload: string) => {
      inputRef.current = payload;
      setInput(payload);
      queueMicrotask(() => void handleSendMessage());
    },
    [handleSendMessage]
  );

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [chatHistory.length, isSending]);

  const catState: InkCatState = isSending
    ? "thinking"
    : input.trim()
      ? "happy"
      : "idle";

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden rounded-3xl border border-stone-200/60 bg-white shadow-2xl">

      {/* 🚀 모바일 바텀시트 손잡이 */}
      <div className="w-full flex justify-center pt-3 pb-1 lg:hidden bg-stone-50/80 shrink-0">
        <div className="w-12 h-1.5 bg-stone-200 rounded-full" />
      </div>

      {/* 헤더 바 */}
      <div className="px-5 py-3 border-b border-stone-100 bg-stone-50/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <InkFaceLottie state={catState} size={28} className="text-stone-900" />
          <div>
            <h3 className="font-extrabold text-stone-800 text-sm leading-none flex items-center gap-1.5">
              {persona.nickname}
              <span className="text-[9px] bg-stone-200/70 text-stone-600 px-1.5 py-0.5 rounded-md font-mono font-normal">
                v2.5
              </span>
            </h3>
            <p className="text-[9px] text-stone-400 mt-1 uppercase tracking-wider font-mono">
              {persona.tone === "CAT_NYANG" ? "Smart Cat Assistant" : "Custom Agent"}
            </p>
          </div>
        </div>

        {/* 🚀 우측 상단 툴바 버튼 세트 */}
        <div className="flex items-center gap-1 text-stone-400">
          <button
            type="button"
            onClick={() => setIsToolBuilderOpen(true)}
            title="나만의 블록 툴 제작 (Sandbox)"
            className="p-1.5 hover:bg-stone-200/60 hover:text-stone-800 rounded-xl text-xs transition-colors cursor-pointer"
          >
            🧩
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="페르소나 및 어조 설정"
            className="p-1.5 hover:bg-stone-200/60 hover:text-stone-800 rounded-lg text-xs transition-colors cursor-pointer"
          >
            ⚙️
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="AI 대화 닫기"
              className="rounded-lg p-1.5 text-lg leading-none hover:bg-stone-200/60 hover:text-stone-800"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* 🚀 [해결 2: 스크롤 제어]: min-h-0 조합으로 부모 탈출 방지 */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="AI 대화 기록"
        tabIndex={0}
        onScroll={() => {
          const container = scrollRef.current;
          if (!container) return;
          shouldStickToBottomRef.current =
            container.scrollHeight - container.scrollTop - container.clientHeight < 80;
        }}
        className="scrollbar-hidden min-h-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto flex flex-col gap-5 p-4 sm:p-5 bg-white"
      >
        {showInitialLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-3">
            <span className="text-2xl animate-spin">⏳</span>
            <p className="text-xs font-mono text-stone-400">동기화 중...</p>
          </div>
        ) : chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-2">
            <InkFaceLottie state="happy" size={44} />
            <p className="text-xs font-bold text-stone-600">
              {status === "authenticated"
                ? `반갑다냥! 나는 ${persona.nickname}이다냥. 어떤 여백을 채워줄까냥?`
                : "로그인이 필요합니다."}
            </p>
          </div>
        ) : (
          chatHistory.map((message, index) => (
            <ChatBubble
              key={`${message.timestamp || index}-${message.role}`}
              message={message}
              personaName={persona.nickname}
              onAction={handleAction}
            />
          ))
        )}
        {isSending && (
          <div className="whitespace-pre-line px-1 py-2 font-mono text-[11px] italic text-stone-400 animate-pulse">
            {progress || `${persona.nickname}이(가) 생각 중입니다...`}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div ref={messagesEndRef} className="h-2 shrink-0" />
      </div>

      {/* 🚀 아이메시지 섬 스타일 입력창 */}
      <div className="shrink-0 bg-white border-t border-stone-100 p-3 pb-safe">
        <form
          onSubmit={(e) => {
            void handleSendMessage(e);
          }}
          className="flex items-end gap-2 bg-stone-50 p-1.5 rounded-[20px] border border-stone-200/70 focus-within:border-stone-400 focus-within:bg-white transition-all shadow-inner"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending || showInitialLoading || status !== "authenticated"}
            className="flex-1 max-h-24 min-h-[44px] bg-transparent text-base sm:text-sm text-stone-800 placeholder-stone-400 resize-none py-3 px-1 focus:outline-none disabled:opacity-50"
            placeholder={
              status === "authenticated"
                ? `${persona.nickname}에게 메시지를 입력하세요...`
                : "로그인 후 사용하세요."
            }
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage(e);
              }
            }}
          />

          <button
            type="submit"
            className="bg-stone-900 text-white hover:bg-stone-800 h-11 w-11 rounded-2xl flex items-center justify-center transition-all shadow-md shrink-0 mb-0.5 disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none cursor-pointer"
            disabled={isSending || !input.trim() || status !== "authenticated" || showInitialLoading}
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
