// Assistant message rendering
"use client";

import React, { useMemo } from "react";
import NextImage from "next/image";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// 🚀 [Pure Bone] @ink/engine의 끊어진 레거시 타입 수출 대신, UI 전용 무결성 인터페이스 직접 명세냥!
export interface ChatComponent {
  type: "table" | "image" | "checklist" | "action_button" | "input_form" | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  url?: string;
  caption?: string;
}

export interface SynthesizedResponse {
  message?: string;
  components?: ChatComponent[];
  evaluation?: {
    isSuccessful?: boolean;
    reason?: string;
    impact?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResult?: any;
}

export function SendIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-current"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L6 12zm0 0h7.5"
      />
    </svg>
  );
}

export function RecommendationBanner({ text }: { text: string }) {
  return (
    <div className="my-3 p-4 rounded-xl border border-stone-200 bg-stone-50/80 backdrop-blur-xs flex gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
      <div className="text-amber-600 text-sm select-none shrink-0 font-bold">
        ⚠️
      </div>
      <div className="flex-1 text-xs leading-relaxed text-stone-600 font-medium tracking-tight whitespace-pre-wrap">
        {text.replace(/^⚠️\s*/, "")}
      </div>
    </div>
  );
}

// 🚀 Extended Interface to support Preceding Textified Tool Logs
interface ExtendedSynthesizedResponse extends SynthesizedResponse {
  prefixText?: string;
}

function normalizePayload(payload: ExtendedSynthesizedResponse): ExtendedSynthesizedResponse {
  if (typeof payload.message !== "string") return payload;

  const rawMessage = payload.message.trim();
  if (!rawMessage.startsWith("{") || !rawMessage.endsWith("}")) return payload;

  try {
    const nested = JSON.parse(rawMessage) as ExtendedSynthesizedResponse;
    if (!nested || typeof nested !== "object") return payload;

    return {
      ...payload,
      message: typeof nested.message === "string" ? nested.message : payload.message,
      components:
        Array.isArray(payload.components) && payload.components.length > 0
          ? payload.components
          : nested.components,
      evaluation: payload.evaluation ?? nested.evaluation,
      rawResult: payload.rawResult ?? nested.rawResult,
    };
  } catch {
    return payload;
  }
}

export function AssistantMessageRenderer({
  content,
  onActionTrigger,
}: {
  content: string;
  onActionTrigger?: (payload: string) => void;
}) {
  const parsedPayload = useMemo((): ExtendedSynthesizedResponse | null => {
    if (!content) return null;

    try {
      let cleanContent = content.trim();

      // 백틱 마크다운 정제 소독냥냥
      cleanContent = cleanContent
        .replace(/^\x60\x60\x60(?:json)?\n?/i, "")
        .replace(/\n?\x60\x60\x60$/i, "")
        .trim();

      const startIdx = cleanContent.indexOf("{");
      const endIdx = cleanContent.lastIndexOf("}");

      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        return null;
      }

      // 🌟 [핵심 파싱 보정]: 대괄호 { 이전에 적힌 툴 실행 마크다운 로그(briefText)를 안전하게 확보!
      const prefixText = cleanContent.substring(0, startIdx).trim();
      const jsonStr = cleanContent.substring(startIdx, endIdx + 1);

      // [1차 시도]: 순수 JSON 복원
      try {
        const payload = JSON.parse(jsonStr);
        if (
          payload &&
          (payload.message !== undefined || payload.components !== undefined)
        ) {
          return normalizePayload({
            ...payload,
            prefixText: prefixText || undefined,
          } as ExtendedSynthesizedResponse);
        }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        // 2차 시도: 제어 문자 이스케이프 완화 처리
      }

      // [2차 시도]: 줄바꿈 깨짐 보정
      const safeStr = jsonStr.replace(/[\u0000-\u001F]+/g, (match) => {
        if (match.includes("\n")) return "\\n";
        if (match.includes("\r")) return "\\r";
        if (match.includes("\t")) return "\\t";
        return "";
      });

      const payload = JSON.parse(safeStr);
      if (
        payload &&
        (payload.message !== undefined || payload.components !== undefined)
      ) {
        return normalizePayload({
          ...payload,
          prefixText: prefixText || undefined,
        } as ExtendedSynthesizedResponse);
      }

      return null;
    } catch (e) {
      console.warn(
        "🚨 [Ink Parser Guard] 데이터 파싱 실패, 일반 텍스트 처리:",
        e,
      );
      return null;
    }
  }, [content]);

  const MarkdownComponents: Components = {
    p: ({ children, ...props }) => {
      const textContent = String(children || "");
      if (textContent.startsWith("⚠️")) {
        return <RecommendationBanner text={textContent} />;
      }
      return (
        <p
          className="text-sm leading-relaxed text-stone-700 font-medium mb-3 last:mb-0"
          {...props}
        >
          {children}
        </p>
      );
    },
    ul: ({ children, ...props }) => (
      <ul
        className="list-disc pl-5 space-y-1.5 my-2.5 text-stone-600 text-sm font-medium"
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol
        className="list-decimal pl-5 space-y-1.5 my-2.5 text-stone-600 text-sm font-medium"
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="marker:text-stone-400 tracking-tight" {...props}>
        {children}
      </li>
    ),
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto my-3 border border-stone-200/60 rounded-xl bg-white shadow-3xs">
        <table
          className="min-w-full text-xs text-stone-600 font-sans border-collapse text-left"
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead
        className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200/80"
        {...props}
      >
        {children}
      </thead>
    ),
    th: ({ children, ...props }) => (
      <th className="px-4 py-2.5 tracking-tight" {...props}>
        {children}
      </th>
    ),
    tr: ({ children, ...props }) => (
      <tr
        className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors"
        {...props}
      >
        {children}
      </tr>
    ),
    td: ({ children, ...props }) => (
      <td
        className="px-4 py-2.5 whitespace-pre-wrap font-medium align-middle"
        {...props}
      >
        {children}
      </td>
    ),
    code: ({ children, ...props }) => (
      <code
        className="bg-stone-100 px-1.5 py-0.5 rounded-md font-mono text-xs text-rose-600 font-semibold border border-stone-200/30 mx-0.5"
        {...props}
      >
        {children}
      </code>
    ),
    img: ({ src, alt }) => {
      if (!src || typeof src !== "string") return null;
      return (
        <div className="overflow-hidden rounded-2xl border border-stone-200/40 bg-white p-1 max-w-xs my-3 shadow-3xs animate-in fade-in duration-300">
          <div className="relative w-full h-40 rounded-xl overflow-hidden bg-stone-50">
            <NextImage
              src={src}
              alt={alt || "Media Asset"}
              fill
              sizes="(max-w-xs) 100vw"
              className="object-cover"
              unoptimized
            />
          </div>
          {alt && (
            <span className="text-[10px] text-stone-400 font-medium px-2 py-1.5 block tracking-tight">
              🖼 {alt}
            </span>
          )}
        </div>
      );
    },
  };

  if (!parsedPayload) {
    return (
      <div className="w-full text-left">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MarkdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left w-full">
      {/* 🌟 [신규출현]: 백엔드에서 꽂아준 텍스트화 도구 로그(Prefix) 상단에 전격 노출! */}
      {parsedPayload.prefixText && (
        <div className="w-full text-xs font-mono text-stone-500 bg-stone-50 border border-stone-200/40 p-2.5 rounded-xl space-y-1 mb-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={MarkdownComponents}
          >
            {parsedPayload.prefixText}
          </ReactMarkdown>
        </div>
      )}

      {parsedPayload.message && (
        <div className="w-full">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={MarkdownComponents}
          >
            {parsedPayload.message}
          </ReactMarkdown>
        </div>
      )}

      {parsedPayload.components &&
        parsedPayload.components.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (comp: ChatComponent | any, idx: number) => {
            if (comp.type === "table" && comp.data) {
              const tableHeaders = comp.data.headers || comp.data.columns || [];
              const tableRows = comp.data.rows || [];

              return (
                <div
                  key={idx}
                  className="overflow-x-auto border border-stone-200/60 rounded-xl bg-white shadow-3xs my-3 animate-in fade-in duration-300"
                >
                  <table className="min-w-full text-xs text-stone-600 font-sans border-collapse text-left">
                    <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200/80">
                      <tr>
                        {tableHeaders.map((h: string, hIdx: number) => (
                          <th key={hIdx} className="px-4 py-2.5 tracking-tight">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row: string[], rIdx: number) => (
                        <tr
                          key={`row-${rIdx}`}
                          className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors"
                        >
                          {row.map((cell: string, cIdx: number) => (
                            <td
                              key={cIdx}
                              className="px-4 py-2.5 whitespace-pre-wrap font-medium"
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={MarkdownComponents}
                              >
                                {String(cell ?? "")}
                              </ReactMarkdown>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {comp.caption && (
                    <div className="px-4 py-1.5 bg-stone-50 text-[10px] text-stone-400 font-medium italic text-center border-t border-stone-100">
                      📋 {comp.caption}
                    </div>
                  )}
                </div>
              );
            }

            if (comp.type === "image" && comp.url) {
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-2xl border border-stone-200/40 bg-white p-1 max-w-xs my-3 shadow-3xs animate-in fade-in duration-300"
                >
                  <div className="relative w-full h-40 rounded-xl overflow-hidden bg-stone-50">
                    <NextImage
                      src={comp.url}
                      alt={comp.caption || "Asset"}
                      fill
                      sizes="(max-w-xs) 100vw"
                      className="object-cover"
                      loading="lazy"
                      unoptimized
                    />
                  </div>
                  <span className="text-[10px] text-stone-400 font-medium px-2 py-1.5 block tracking-tight">
                    🖼 {comp.caption}
                  </span>
                </div>
              );
            }

            if (comp.type === "checklist" && comp.data) {
              return (
                <div
                  key={idx}
                  className="bg-stone-50/60 border border-stone-200/60 rounded-2xl p-4 max-w-sm my-3 space-y-2 shadow-4xs animate-in fade-in duration-300"
                >
                  <h5 className="font-bold text-xs text-stone-700 uppercase tracking-wider mb-2">
                    📋 {comp.data.title || "체크리스트"}
                  </h5>
                  {comp.data.tasks?.map(
                    (t: { id: string; isDone: boolean; text: string }) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2.5 text-xs text-stone-600 font-medium py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={t.isDone}
                          className="rounded border-stone-300 text-stone-900 focus:ring-transparent cursor-not-allowed w-3.5 h-3.5"
                          readOnly
                        />
                        <span
                          className={
                            t.isDone
                              ? "line-through text-stone-400 font-normal"
                              : "text-stone-600"
                          }
                        >
                          {t.text}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              );
            }

            if (comp.type === "action_button" && comp.data) {
              return (
                <button
                  key={idx}
                  onClick={() => onActionTrigger?.(comp.data.payload)}
                  className="bg-stone-900 text-white hover:bg-stone-800 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-3xs w-fit self-start active:scale-95 flex items-center gap-2 mt-2 mb-1"
                >
                  <span className="text-sm">⚡</span>
                  {comp.data.label}
                </button>
              );
            }

            if (comp.type === "input_form" && comp.data) {
              return (
                <div key={idx} className="flex flex-wrap gap-2 mt-2 mb-1">
                  {comp.data.options?.map((opt: string, i: number) => (
                    <button
                      key={i}
                      onClick={() =>
                        onActionTrigger?.(`${opt} 옵션으로 할게냥!`)
                      }
                      className="bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300 shadow-3xs px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              );
            }

            return null;
          },
        )}

      {parsedPayload.evaluation && (
        <details className="text-[10px] font-mono text-stone-400 cursor-pointer select-none opacity-40 hover:opacity-100 transition-opacity pt-1 group">
          <summary className="outline-none group-open:text-stone-500 hover:underline">
            상태 연산 무결성 로그 확인
          </summary>
          <div className="bg-stone-50 border border-stone-200/40 rounded-xl p-3 mt-2 space-y-1 text-stone-500 text-[11px] leading-relaxed font-sans cursor-default">
            {parsedPayload.evaluation.reason && (
              <p>
                <strong>정합성 검증:</strong> {parsedPayload.evaluation.reason}
              </p>
            )}
            {parsedPayload.evaluation.impact && (
              <p>
                <strong>인프라 영향:</strong> {parsedPayload.evaluation.impact}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
