"use client";

import Image from "next/image";
import { LivingItem } from "@ink/engine";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";

interface InventoryItemCardProps {
  item: LivingItem;
  isUpdated: boolean;
  isAdded: boolean;
  onDecrement: () => void;
  onDelete: () => void;
  onEditTrigger: (item: LivingItem) => void;
  disabled: boolean;
}

export function InventoryItemCard({
  item,
  isUpdated,
  isAdded,
  onDecrement,
  onDelete,
  onEditTrigger,
  disabled,
}: InventoryItemCardProps) {
  const [imgError, setImgError] = useState(false);

  const expDate = item.expirationDate;
  const isExpired = expDate && new Date(expDate) < new Date();
  const isSoon =
    expDate &&
    !isExpired &&
    new Date(expDate).getTime() - new Date().getTime() <
      7 * 24 * 60 * 60 * 1000;

  const renderNoImagePlaceholder = () => (
    <div className="flex flex-col items-center justify-center gap-2 text-stone-300">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.2}
        stroke="currentColor"
        className="w-9 h-9"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      <span className="text-[9px] font-mono tracking-wider text-stone-400 font-bold uppercase">
        NO ASSET IMAGE
      </span>
    </div>
  );

  // 🗺️ [위치 입체화]: 사제가 요청한 positionSchema의 name(location)과 id(locationId) 동시 인출 장치냥!
  const displayLocation = useMemo(() => {
    const name = item.location;
    const id = item.locationId;
    if (!name && !id) return "미지정 보관소";
    if (name && id) return `${name} (${id})`;
    return name || id || "미지정 보관소";
  }, [item.location, item.locationId]);

  return (
    <div
      onDoubleClick={() => onEditTrigger(item)} // 닥닥! 더블클릭 격발 단자
      className={`group relative flex flex-col justify-between rounded-2xl border bg-white p-3 shadow-3xs transition-all duration-200 cursor-pointer select-none ${
        isUpdated
          ? "border-emerald-500 bg-emerald-50/10 ring-2 ring-emerald-500/20 shadow-md transform scale-[1.01]"
          : isAdded
            ? "border-amber-500 bg-amber-50/10 ring-2 ring-amber-500/20 shadow-md animate-pulse"
            : "border-stone-200/60 hover:border-stone-300 hover:shadow-sm"
      }`}
      title="💡 더블클릭하면 상세 레이아웃 수정 모달이 열린다냥!"
    >
      <div>
        <div className="relative mb-2 flex h-20 w-full items-center justify-center overflow-hidden rounded-xl border border-stone-100/50 bg-stone-100/70 sm:h-24">
          {item.imageUrl && !imgError ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              unoptimized
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            renderNoImagePlaceholder()
          )}
        </div>

        <div className="mb-1.5 flex items-start justify-between">
          <Badge
            variant={
              item.domainType === "FOOD"
                ? "success"
                : item.domainType === "MEDICINE" ||
                    item.domainType === "CLOTHES"
                  ? "danger"
                  : "default"
            }
          >
            {item.domainType}
          </Badge>
          <span className="text-[10px] font-mono text-stone-300 uppercase">
            ID: {item.id.substring(0, 6)}
          </span>
        </div>
        <h4 className="mb-1 truncate text-sm font-bold leading-tight text-stone-900 transition-colors group-hover:text-stone-950">
          {item.name}
        </h4>
        {item.sharedByName && (
          <p className="mb-1 text-[10px] font-bold text-violet-600">
            {item.sharedByName}님이 공개한 물품
          </p>
        )}
        {/* 📍 위치 이름과 ID가 미니멀하게 통합 출력되는 구간냥! */}
        <p className="truncate text-[11px] font-semibold tracking-tight text-stone-500">
          📍 {displayLocation}
        </p>
      </div>

      <div>
        <div className="mb-2 mt-2 flex flex-wrap gap-1.5 rounded-lg border border-stone-100 bg-stone-50/80 p-1.5 font-mono text-[9px] text-stone-500">
          <span className="flex items-center gap-1">📦 {item.status}</span>
          {expDate && (
            <span
              className={`flex items-center gap-1 font-bold ${isExpired ? "text-rose-600 bg-rose-50 px-1.5 rounded" : isSoon ? "text-amber-600 bg-amber-50 px-1.5 rounded" : "text-stone-500"}`}
            >
              {isExpired ? "🔥" : isSoon ? "⚠️" : "⏳"} {expDate}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 pt-2">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-lg font-black text-stone-900 ${isUpdated ? "text-emerald-600" : ""}`}
            >
              {item.quantity}
            </span>
            <span className="text-xs font-bold text-stone-400 uppercase">
              {item.unit}
            </span>
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={(e) => {
                if (
                  item.quantity === 0 &&
                  confirm("해당 물품을 삭제하시겠습니까?")
                ) {
                  onDelete();
                  return;
                }
                e.stopPropagation();
                onDecrement();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-xs font-bold text-stone-600 transition-all hover:bg-stone-200 active:scale-95"
              disabled={disabled}
            >
              -
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-xs font-bold text-rose-400 transition-all hover:bg-rose-100 hover:text-rose-600 active:scale-95"
              disabled={disabled}
            >
              ×
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEditTrigger(item);
          }}
          disabled={disabled}
          className="mt-2 w-full rounded-lg bg-stone-100 py-1.5 text-[10px] font-bold text-stone-600 hover:bg-stone-200 disabled:opacity-50"
        >
          상세 수정
        </button>
        {item.lastModifiedByName && (
          <p className="mt-1.5 truncate text-[9px] text-stone-400">
            마지막 수정: {item.lastModifiedByName}
            {item.lastModifiedAt
              ? ` · ${new Date(item.lastModifiedAt).toLocaleString()}`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}
