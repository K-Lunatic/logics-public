"use client";

import { useState, useMemo } from "react";
import { useInventory, type ReceiptPreview } from "@ink/assembler";
import { LivingItem } from "@ink/engine";
import { InkFace } from "@/components/ui";

import { EditItemModal } from "./EditItemModal";
import { InventoryItemCard } from "./InventoryItemCard";
import { ReceiptReviewModal } from "./ReceiptReviewModal";

export function InventorySection({
  searchQuery = "",
}: {
  searchQuery?: string;
}) {
  const {
    items,
    isLoading,
    isMutating,
    error,
    updateItem,
    deleteItem,
    consumeItem,
    createItem,
    analyzeReceipt,
    commitReceipt,
  } = useInventory();

  const [selectedItem, setSelectedItem] = useState<LivingItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [visionMessage, setVisionMessage] = useState("");
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreview | null>(null);
  const [newItem, setNewItem] = useState({
    name: "",
    domainType: "ETC" as LivingItem["domainType"],
    quantity: 1,
    unit: "개" as LivingItem["unit"],
    location: "",
    expirationDate: "",
  });

  const [catFilter, setCatFilter] = useState<string>("전체");
  const [locFilter, setLocFilter] = useState<string>("전체");
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [dashboardNow] = useState(() => Date.now());

  const typedItems = useMemo<LivingItem[]>(() => {
    if (!items || !Array.isArray(items)) return [];
    return items as LivingItem[];
  }, [items]);

  const filteredItems = useMemo(() => {
    return typedItems.filter((item) => {
      const matchCat = catFilter === "전체" || item.domainType === catFilter;
      const matchLoc =
        locFilter === "전체" ||
        item.locationId === locFilter ||
        item.location === locFilter;
      const normalizedSearch = localSearch.trim().toLowerCase();
      const matchSearch =
        !normalizedSearch ||
        [item.name, item.location, item.locationId, item.domainType]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchCat && matchLoc && matchSearch;
    });
  }, [typedItems, catFilter, locFilter, localSearch]);

  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(typedItems.map((i) => i.domainType)))],
    [typedItems],
  );

  const positionSkus = useMemo(
    () => [
      "전체",
      ...Array.from(
        new Set(
          typedItems.map((i) => i.locationId || i.location).filter(Boolean),
        ),
      ),
    ],
    [typedItems],
  );
  const dashboardStats = useMemo(() => {
    const soon = dashboardNow + 7 * 24 * 60 * 60 * 1000;
    return {
      total: typedItems.length,
      visible: filteredItems.length,
      lowStock: typedItems.filter((item) => item.quantity <= 1).length,
      expiring: typedItems.filter((item) => {
        if (!item.expirationDate) return false;
        const time = new Date(item.expirationDate).getTime();
        return Number.isFinite(time) && time <= soon;
      }).length,
    };
  }, [typedItems, filteredItems.length, dashboardNow]);

  const handleEditTrigger = (item: LivingItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const created = await createItem({
      ...newItem,
      location: newItem.location || undefined,
      expirationDate: newItem.expirationDate || undefined,
    });
    if (!created) return;
    setNewItem({
      name: "",
      domainType: "ETC",
      quantity: 1,
      unit: "개",
      location: "",
      expirationDate: "",
    });
    setIsCreateOpen(false);
  };

  const handleVisionImage = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setVisionMessage("사진을 읽고 재무와 물품 후보를 분리하는 중...");
    try {
      const imageDataUrl = await compressInventoryImage(file);
      const preview = await analyzeReceipt(imageDataUrl);
      if (preview) {
        setReceiptPreview(preview);
        setVisionMessage("인식이 끝났습니다. 저장 전 내용을 확인해 주세요.");
      }
    } catch {
      setVisionMessage("이미지를 처리하지 못했습니다.");
    }
  };

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-500">
      <div className="space-y-3 border-b border-stone-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-stone-100 p-2 rounded-xl">
              <InkFace size={24} className="text-stone-700" />
            </div>
            <div>
              <h3 className="text-xl font-black text-stone-900 tracking-tight">
                물품 장부
              </h3>
              <p className="text-xs text-stone-400 font-medium tracking-wide">
                {isLoading
                  ? "☁️ 클라우드 동기화 중..."
                  : "Ink가 관리 중인 당신의 살림"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className={`cursor-pointer rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 shadow-sm ${isMutating ? "pointer-events-none opacity-50" : ""}`}>
              👁 영수증·바코드
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleVisionImage}
                disabled={isMutating}
              />
            </label>
            <button
              type="button"
              onClick={() => setIsCreateOpen((open) => !open)}
              className="rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white"
              disabled={isMutating}
            >
              + 직접 등록
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <InventoryMetric label="전체 물품" value={dashboardStats.total} />
          <InventoryMetric label="현재 표시" value={dashboardStats.visible} />
          <InventoryMetric label="수량 1 이하" value={dashboardStats.lowStock} tone="amber" />
          <InventoryMetric label="기한 임박·경과" value={dashboardStats.expiring} tone="rose" />
        </div>

        {isCreateOpen && (
          <form
            onSubmit={handleCreate}
            className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-3"
          >
            <input
              required
              value={newItem.name}
              onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
              placeholder="물품 이름"
              className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
            />
            <select
              value={newItem.domainType}
              onChange={(event) => setNewItem({ ...newItem, domainType: event.target.value as LivingItem["domainType"] })}
              className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
            >
              {["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"].map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                required
                value={newItem.quantity}
                onChange={(event) => setNewItem({ ...newItem, quantity: Number(event.target.value) })}
                className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm"
              />
              <select
                value={newItem.unit}
                onChange={(event) => setNewItem({ ...newItem, unit: event.target.value as LivingItem["unit"] })}
                className="rounded-xl border border-stone-200 px-2 py-2 text-sm"
              >
                {["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"].map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
            <input
              value={newItem.location}
              onChange={(event) => setNewItem({ ...newItem, location: event.target.value })}
              placeholder="보관 위치"
              className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={newItem.expirationDate}
              onChange={(event) => setNewItem({ ...newItem, expirationDate: event.target.value })}
              required={newItem.domainType === "FOOD" || newItem.domainType === "MEDICINE"}
              className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm font-bold">취소</button>
              <button type="submit" className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white">저장</button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {visionMessage && !error && (
          <p role="status" className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-700">
            {visionMessage}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px]">
          <input
            type="search"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="이름·위치·분류 검색"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
          />
          <select aria-label="물품 분류 필터" value={catFilter} onChange={(event) => setCatFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
            {categories.map((category) => <option key={category} value={category}>{category === "전체" ? "전체 분류" : category}</option>)}
          </select>
          <select aria-label="보관 위치 필터" value={locFilter} onChange={(event) => setLocFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
            {positionSkus.map((location) => <option key={location} value={location}>{location === "전체" ? "전체 위치" : location}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
        {isLoading ? (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-stone-400 animate-pulse">
            <span className="text-4xl mb-4">⏳</span>
            <p className="text-sm font-medium font-mono">
              장부를 읽어오고 있다냥...
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-stone-400">
            <span className="text-4xl mb-4">📭</span>
            <p className="text-sm font-medium">조회된 물품이 없습니다.</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <InventoryItemCard
              key={item.id}
              item={item}
              isUpdated={false}
              isAdded={false}
              onDecrement={() => consumeItem(item.id)}
              onDelete={() => deleteItem(item.id)}
              onEditTrigger={handleEditTrigger}
              disabled={isMutating}
            />
          ))
        )}
      </div>

      <EditItemModal
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedItem(null);
        }}
        onSave={(updates) => {
          if (selectedItem?.id) {
            return updateItem(selectedItem.id, updates);
          }
          return Promise.resolve(null);
        }}
      />
      {receiptPreview && (
        <ReceiptReviewModal
          key={`${receiptPreview.merchant}-${receiptPreview.items.length}`}
          preview={receiptPreview}
          saving={isMutating}
          onClose={() => setReceiptPreview(null)}
          onSave={async (input) => {
            const saved = await commitReceipt(input);
            if (!saved) return;
            setReceiptPreview(null);
            setVisionMessage(
              `재무 ${saved.transactions.length}건과 물품 ${saved.items.length}건을 저장했습니다.`,
            );
          }}
        />
      )}
    </div>
  );
}

function InventoryMetric({
  label,
  value,
  tone = "stone",
}: {
  label: string;
  value: number;
  tone?: "stone" | "amber" | "rose";
}) {
  const colors = {
    stone: "bg-stone-50 text-stone-900",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
  };
  return (
    <div className={`rounded-xl px-3 py-2 ${colors[tone]}`}>
      <p className="text-[10px] font-bold text-current/55">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}

async function compressInventoryImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일이 아닙니다.");
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("이미지 로드 실패"));
    });
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지 변환 실패");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
