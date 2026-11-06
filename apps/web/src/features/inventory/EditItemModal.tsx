"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  compressImageBeforeUpload,
  searchInventoryImageAction,
} from "@ink/assembler";
import { LivingItem } from "@ink/engine";

interface EditItemModalProps {
  item: LivingItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<LivingItem>) => Promise<unknown>;
}

interface ModalFormState {
  name: string;
  domainType: LivingItem["domainType"];
  quantity: number;
  unit: LivingItem["unit"];
  location: string;
  locationId: string | null;
  status: LivingItem["status"];
  expirationDate: string;
  imageUrl: string;
}

const defaultFormState = (item: LivingItem | null): ModalFormState => ({
  name: item?.name || "",
  domainType: item?.domainType || "FOOD",
  quantity: item?.quantity ?? 0,
  unit: item?.unit || "개",
  location: item?.location || "",
  locationId: item?.locationId ?? null,
  status: item?.status || "INBOX",
  expirationDate: item?.expirationDate || "",
  imageUrl: item?.imageUrl || "",
});

export function EditItemModal({
  item,
  isOpen,
  onClose,
  onSave,
}: EditItemModalProps) {
  const [formState, setFormState] = useState<ModalFormState>(() =>
    defaultFormState(item),
  );
  const [mediaMode, setMediaMode] = useState<"link" | "file" | "camera">(
    "link",
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEmbedValid, setIsEmbedValid] = useState(true);
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [imageMessage, setImageMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && item) {
      // 모달이 열리고, 아이템 데이터가 존재할 때 폼을 최신화한다냥!
      // AI가 백그라운드에서 데이터를 바꿨든, 내가 새로 클릭했든 무조건 최신 데이터가 꽂힌다냥!
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormState(defaultFormState(item));
      setIsEmbedValid(true);
      setMediaMode("link"); // 미디어 모드 초기화
    }
  }, [isOpen, item]); // 💡 핵심: 모달 열림 상태(isOpen)나 아이템 객체(item)가 변할 때마다 발동냥!

  if (!isOpen || !item) return null;

  const updateFormField = <K extends keyof ModalFormState>(
    key: K,
    value: ModalFormState[K],
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleMediaProcess = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    try {
      setIsUploading(true);
      setIsEmbedValid(true);
      const compressedBlob = await compressImageBeforeUpload(
        rawFile,
        800,
        0.75,
      );
      const localBlobUrl = URL.createObjectURL(compressedBlob);
      updateFormField("imageUrl", localBlobUrl);

      const form = new FormData();
      form.append(
        "file",
        new File([compressedBlob], "snapshot.webp", { type: "image/webp" }),
      );
      form.append("itemId", item.id);

      const response = await fetch("/api/upload/drive", {
        method: "POST",
        body: form,
      });
      const data = await response.json();

      if (data.success) {
        updateFormField("imageUrl", data.imageUrl);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error("🚨 미디어 업로드 실패냥:", err);
      setIsEmbedValid(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const saved = await onSave({
        name: formState.name,
        domainType: formState.domainType,
        quantity: Number(formState.quantity),
        unit: formState.unit,
        location: formState.location,
        locationId: formState.locationId,
        status: formState.status,
        expirationDate: formState.expirationDate || undefined,
        imageUrl: formState.imageUrl || undefined,
        updatedAt: new Date().toISOString(),
      });
      if (saved === null) return;
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-stone-200/40 overflow-hidden transform animate-in zoom-in-95 duration-200 grid grid-cols-1 md:grid-cols-2">
        {/* 왼쪽 대지: 이미지 제어 영역 */}
        <div className="bg-stone-50/70 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-stone-200/60">
          <div>
            <span className="block text-[11px] font-bold tracking-wider text-stone-400 mb-3 uppercase">
              물품 사진 등록
            </span>

            <div className="grid grid-cols-3 gap-1 rounded-xl bg-stone-200/50 p-1 mb-4">
              {(["link", "file", "camera"] as const).map((modeType) => (
                <button
                  key={modeType}
                  type="button"
                  onClick={() => setMediaMode(modeType)}
                  className={`rounded-lg py-1.5 text-xs font-bold transition-all ${
                    mediaMode === modeType
                      ? "bg-stone-900 text-white shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {mediaMode === "link"
                    ? "링크"
                    : mediaMode === "file"
                      ? "파일"
                      : "카메라"}
                </button>
              ))}
            </div>

            <div className="min-h-[44px] flex items-center mb-4">
              {mediaMode === "link" && (
                <div className="grid w-full gap-2">
                  <input
                    type="url"
                    value={formState.imageUrl}
                    onChange={(e) => {
                      updateFormField("imageUrl", e.target.value);
                      setIsEmbedValid(true);
                    }}
                    placeholder="이미지 인터넷 주소(URL) 붙여넣기"
                    className="w-full border border-stone-200 bg-white rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-stone-400 transition-all"
                  />
                  <button
                    type="button"
                    disabled={isSearchingImage || !formState.name.trim()}
                    onClick={async () => {
                      setIsSearchingImage(true);
                      setImageMessage("");
                      const result = await searchInventoryImageAction(formState.name);
                      setIsSearchingImage(false);
                      if (!result.success) return setImageMessage(result.error);
                      updateFormField("imageUrl", result.data.imageUrl);
                      setIsEmbedValid(true);
                      setImageMessage(result.warning || "대표 이미지를 찾았습니다.");
                    }}
                    className="rounded-xl bg-stone-900 py-2 text-xs font-black text-white disabled:bg-stone-300"
                  >
                    {isSearchingImage ? "이미지 찾는 중…" : "물품 이름으로 이미지 찾기"}
                  </button>
                  {imageMessage && <p className="text-[10px] font-bold text-stone-500">{imageMessage}</p>}
                </div>
              )}
              {mediaMode === "file" && (
                <div className="w-full">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleMediaProcess}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full bg-white border-2 border-dashed border-stone-200 hover:border-stone-300 text-stone-600 rounded-xl py-2 text-xs font-semibold transition-all"
                  >
                    {isUploading
                      ? "🌿 압축 다이어트 중..."
                      : "📂 살림 사진 파일 찾아보기"}
                  </button>
                </div>
              )}
              {mediaMode === "camera" && (
                <div className="w-full">
                  <input
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleMediaProcess}
                  />
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full bg-stone-900 text-white hover:bg-stone-800 rounded-xl py-2 text-xs font-bold transition-all shadow-sm shadow-stone-900/5"
                  >
                    {isUploading ? "🌿 사진 최적화 중..." : "📸 폰 카메라 열기"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="relative h-44 w-full rounded-2xl bg-stone-200/40 overflow-hidden flex items-center justify-center border border-stone-200/30">
            <span className="absolute left-3 top-3 z-10 rounded-md bg-stone-900/70 px-2 py-0.5 font-mono text-[9px] text-white tracking-wide">
              살림 사진 확인
            </span>
            {formState.imageUrl && isEmbedValid ? (
              <Image
                src={formState.imageUrl}
                alt="Live Embed Asset"
                fill
                unoptimized
                className="object-cover"
                onError={() => setIsEmbedValid(false)}
              />
            ) : (
              <div className="text-center text-stone-400 text-xs font-medium tracking-tight">
                등록된 물품 사진이 없습니다
              </div>
            )}
            {isUploading && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-xs flex items-center justify-center font-sans text-xs font-bold text-stone-900 animate-pulse">
                드라이브에 안전하게 담는 중...
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 대지: 명세 등록 폼 */}
        <form
          onSubmit={handleSubmit}
          className="scrollbar-hidden overscroll-contain p-6 space-y-4 flex flex-col justify-between max-h-[85vh] overflow-y-auto bg-white"
        >
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  물품 이름
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => updateFormField("name", e.target.value)}
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  살림 분류
                </label>
                <select
                  value={formState.domainType}
                  onChange={(e) =>
                    updateFormField(
                      "domainType",
                      e.target.value as LivingItem["domainType"],
                    )
                  }
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-700"
                >
                  <option value="FOOD">식품 🍏</option>
                  <option value="MEDICINE">의약품 💊</option>
                  <option value="CLOTHES">의류 👕</option>
                  <option value="BOOK">도서 📚</option>
                  <option value="ETC">기타 잡화 📦</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  보관 수량
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formState.quantity}
                  onChange={(e) =>
                    updateFormField("quantity", Number(e.target.value))
                  }
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  측정 단위
                </label>
                <select
                  value={formState.unit}
                  onChange={(e) =>
                    updateFormField(
                      "unit",
                      e.target.value as LivingItem["unit"],
                    )
                  }
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-700"
                >
                  {[
                    "개",
                    "알",
                    "포",
                    "g",
                    "kg",
                    "ml",
                    "L",
                    "장",
                    "박스",
                    "권",
                  ].map((u) => (
                    <option key={`unit-select-modal-${u}`} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  보관소 명칭
                </label>
                <input
                  type="text"
                  value={formState.location}
                  onChange={(e) => updateFormField("location", e.target.value)}
                  placeholder="예: 냉장고 냉동실, 책장 상단"
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-800 placeholder:text-stone-300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  보관소 고유번호 (SKU)
                </label>
                <input
                  type="text"
                  value={formState.locationId || ""}
                  onChange={(e) =>
                    updateFormField("locationId", e.target.value || null)
                  }
                  placeholder="LOC-FRIDGE-01"
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-700 placeholder:text-stone-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  살림 상태
                </label>
                <select
                  value={formState.status}
                  onChange={(e) =>
                    updateFormField(
                      "status",
                      e.target.value as LivingItem["status"],
                    )
                  }
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-700"
                >
                  <option value="INBOX">도착함 📥</option>
                  <option value="STORED">정리 완료 📦</option>
                  <option value="CONSUMED">모두 소비 🍽️</option>
                  <option value="DISCARDED">정리/폐기 🗑️</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  소비/유통 기한
                </label>
                <input
                  type="date"
                  value={formState.expirationDate}
                  onChange={(e) =>
                    updateFormField("expirationDate", e.target.value)
                  }
                  className="w-full border border-stone-200 bg-stone-50/50 rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-stone-400 focus:bg-white transition-all text-stone-700"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 grid grid-cols-2 gap-2.5 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-stone-100 text-stone-600 rounded-xl py-2.5 text-xs font-bold hover:bg-stone-200 transition-all"
            >
              돌아가기
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-stone-900 text-white rounded-xl py-2.5 text-xs font-black hover:bg-stone-800 transition-all shadow-md shadow-stone-900/10 disabled:bg-stone-300"
            >
              {isSaving ? "저장 중..." : "장부 동기화"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
