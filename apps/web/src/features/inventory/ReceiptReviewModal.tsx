"use client";

import { useState } from "react";
import type {
  ReceiptCommitInput,
  ReceiptPreview,
} from "@ink/assembler";
import { toReceiptCommitInput } from "./receiptReview";

const DOMAINS = ["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"] as const;
const UNITS = ["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"] as const;
const FINANCE_CATEGORIES = [
  "식비", "교통/차량", "문화생활", "마트/편의점", "패션/미용", "생활용품",
  "주거/통신", "건강", "교육", "경조사비/회비", "이체", "부모님", "기타",
];

interface ReceiptReviewModalProps {
  preview: ReceiptPreview;
  saving: boolean;
  onClose: () => void;
  onSave: (input: ReceiptCommitInput) => Promise<void>;
}

export function ReceiptReviewModal({
  preview,
  saving,
  onClose,
  onSave,
}: ReceiptReviewModalProps) {
  const [includeFinance, setIncludeFinance] = useState(Boolean(preview.finance));
  const [finance, setFinance] = useState(preview.finance);
  const [items, setItems] = useState(
    preview.items.map((item) => ({ ...item, selected: true })),
  );
  const selectedItems = items.filter((item) => item.selected);

  const submit = async () => {
    await onSave(toReceiptCommitInput(includeFinance, finance, items));
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end bg-stone-950/45 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="영수증 인식 결과 검수"
        className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[30px] bg-stone-50 shadow-2xl sm:rounded-[30px]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">
              {preview.documentType} · 저장 전 검수
            </p>
            <h2 className="text-lg font-black text-stone-950">
              {preview.merchant || "인식된 사진"} 확인
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-black">
            닫기
          </button>
        </header>

        <div className="scrollbar-hidden min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {preview.warnings.length > 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              <strong>확인이 필요한 내용</strong>
              <ul className="mt-1 list-disc pl-4">
                {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <label className="flex items-center justify-between gap-3">
              <span>
                <strong className="block text-sm text-stone-900">재무에 지출 추가</strong>
                <span className="text-xs text-stone-400">식당·카페 영수증은 보통 이 항목만 선택합니다.</span>
              </span>
              <input
                type="checkbox"
                checked={includeFinance}
                disabled={!finance}
                onChange={(event) => setIncludeFinance(event.target.checked)}
                className="h-5 w-5"
              />
            </label>
            {finance ? (
              <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${includeFinance ? "" : "pointer-events-none opacity-40"}`}>
                <Field label="내용">
                  <input value={finance.description} onChange={(event) => setFinance({ ...finance, description: event.target.value })} className="finance-input" />
                </Field>
                <Field label="금액">
                  <input type="number" min="1" value={finance.amount} onChange={(event) => setFinance({ ...finance, amount: Number(event.target.value) })} className="finance-input" />
                </Field>
                <Field label="날짜">
                  <input type="date" value={finance.date} onChange={(event) => setFinance({ ...finance, date: event.target.value })} className="finance-input" />
                </Field>
                <Field label="분류">
                  <select value={finance.category} onChange={(event) => setFinance({ ...finance, category: event.target.value })} className="finance-input">
                    {FINANCE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="결제 자산">
                  <input value={finance.assetAccount} onChange={(event) => setFinance({ ...finance, assetAccount: event.target.value })} className="finance-input" placeholder="카드, 현금 등" />
                </Field>
                <p className="self-end text-right text-[10px] font-bold text-stone-400">
                  인식 신뢰도 {Math.round(finance.confidence * 100)}%
                </p>
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-400">재무 후보가 인식되지 않았습니다.</p>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="mb-3">
              <strong className="block text-sm text-stone-900">물품에 추가</strong>
              <span className="text-xs text-stone-400">실제로 보관할 상품만 선택하고 잘못 읽힌 내용을 수정하세요.</span>
            </div>
            {items.length === 0 ? (
              <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-400">추가할 물품이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={`${index}-${item.barcode || item.name}`} className={`rounded-xl border p-3 ${item.selected ? "border-stone-200" : "border-stone-100 opacity-45"}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-black">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, selected: event.target.checked } : entry))}
                        />
                        물품 {index + 1}
                      </label>
                      <span className="text-[10px] font-bold text-stone-400">신뢰도 {Math.round(item.confidence * 100)}%</span>
                    </div>
                    <div className={`grid gap-2 sm:grid-cols-6 ${item.selected ? "" : "pointer-events-none"}`}>
                      <input value={item.name} onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, name: event.target.value } : entry))} className="finance-input sm:col-span-2" placeholder="물품 이름" />
                      <select value={item.domainType} onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, domainType: event.target.value as typeof item.domainType } : entry))} className="finance-input">
                        {DOMAINS.map((domain) => <option key={domain}>{domain}</option>)}
                      </select>
                      <input type="number" min="0" value={item.quantity} onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Number(event.target.value) } : entry))} className="finance-input" />
                      <select value={item.unit} onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unit: event.target.value as typeof item.unit } : entry))} className="finance-input">
                        {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                      </select>
                      <input type="date" value={item.expirationDate || ""} onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, expirationDate: event.target.value || null } : entry))} className="finance-input" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="shrink-0 border-t border-stone-200 bg-white p-4">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={
              saving ||
              (!includeFinance && selectedItems.length === 0) ||
              (includeFinance && (!finance || finance.amount <= 0 || !finance.description.trim()))
            }
            className="w-full rounded-2xl bg-stone-950 py-3.5 text-sm font-black text-white disabled:bg-stone-300"
          >
            {saving
              ? "저장 중..."
              : `검수 완료 · 재무 ${includeFinance && finance ? 1 : 0}건 / 물품 ${selectedItems.length}건 저장`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs font-bold text-stone-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
