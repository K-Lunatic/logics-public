// 📂 packages/assembler/src/hooks/useInventory.ts
"use client";

import { useRef, useState } from "react";
import { useDataStore } from "./useDataStore";
import { LivingItem, LivingItemPayload } from "@ink/engine";
import {
  listInventoryAction,
  addItemAction,
  createItemAction,
  consumeInventoryItemAction,
  updateInventoryItemAction,
  deleteInventoryItemAction,
} from "../action/inventory.action";
import {
  analyzeReceiptImageAction,
  commitReceiptReviewAction,
  type ReceiptCommitInput,
} from "../action/smartLife.actions";

/**
 * 📦 [1. 자산 인벤토리 조회 & 하이브리드 영속성 훅]
 * IndexedDB 0ms 오프라인 캐싱 + Firestore 자동 원자적 동기화
 */
export function useInventory() {
  const { data: rawItems, updateData, loading } = useDataStore<LivingItemPayload[]>({
    key: "inventory",
    fetcher: listInventoryAction,
  });
  const items = rawItems || [];
  const lock = useRef(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState("");

  const mutate = async <T>(task: () => Promise<T>): Promise<T | null> => {
    if (lock.current) return null;
    lock.current = true;
    setIsMutating(true);
    setError("");
    try {
      return await task();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "물품을 변경하지 못했습니다."
      );
      return null;
    } finally {
      lock.current = false;
      setIsMutating(false);
    }
  };

  const updateItem = (id: string, updates: Partial<LivingItemPayload>) =>
    mutate(async () => {
      const result = await updateInventoryItemAction(id, updates);
      if (!result.success) throw new Error(result.error);
      await updateData(items.map((item) => item.id === id ? result.data : item));
      return result.data;
    });

  const deleteItem = (id: string) =>
    mutate(async () => {
      const result = await deleteInventoryItemAction(id);
      if (!result.success) throw new Error(result.error);
      await updateData(items.filter((item) => item.id !== id));
      return true;
    });

  const consumeItem = (id: string) =>
    mutate(async () => {
      const result = await consumeInventoryItemAction(id);
      if (!result.success) throw new Error(result.error);
      await updateData(
        items.map((item) => item.id === id ? result.data : item),
      );
      return result.data;
    });

  const createItem = (input: Parameters<typeof createItemAction>[0]) =>
    mutate(async () => {
      const result = await createItemAction(input);
      if (!result.success) throw new Error(result.error);
      await updateData([...items, result.data]);
      return true;
    });

  const analyzeReceipt = (imageDataUrl: string) =>
    mutate(async () => {
      const result = await analyzeReceiptImageAction(imageDataUrl);
      if (!result.success) throw new Error(result.error);
      return result.data;
    });

  const commitReceipt = (input: ReceiptCommitInput) =>
    mutate(async () => {
      const result = await commitReceiptReviewAction(input);
      if (!result.success) throw new Error(result.error);
      await updateData([...items, ...result.data.items]);
      return result.data;
    });

  return {
    items,
    isLoading: loading && items.length === 0,
    isMutating,
    error,
    updateItem,
    deleteItem,
    consumeItem,
    createItem,
    analyzeReceipt,
    commitReceipt,
  };
}

/**
 * ➕ [2. 자산 추가 뮤테이션 훅 (Optimistic UI & 원자적 저장)]
 */
export function useAddItem() {
  const { data: rawItems, updateData } = useDataStore<LivingItem[]>({
    key: "inventory",
    fetcher: listInventoryAction,
  });
  const lock = useRef(false);
  const [isMutating, setIsMutating] = useState(false);

  const mutate = async (newItem: Partial<LivingItem>) => {
    if (lock.current) return null;
    lock.current = true;
    setIsMutating(true);
    const items = rawItems || [];

    const itemWithId = {
      id: newItem.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: newItem.createdAt || new Date().toISOString(),
      name: newItem.name || "신규 물품",
      domainType: newItem.domainType || "FOOD",
      quantity: newItem.quantity ?? 1,
      ...newItem,
    } as LivingItem;

    try {
      const result = await addItemAction(itemWithId);
      if (!result.success) throw new Error(result.error);
      await updateData([result.data, ...items] as LivingItem[]);
      return { item: result.data, result: result.data };
    } finally {
      lock.current = false;
      setIsMutating(false);
    }
  };

  return {
    mutate,
    mutateAsync: mutate,
    isMutating,
  };
}

/**
 * 🔄 [3. 자산 수량/상태 변경 뮤테이션 훅]
 */
export function useUpdateItem() {
  const { data: rawItems, updateData } = useDataStore<LivingItem[]>({
    key: "inventory",
    fetcher: listInventoryAction,
  });
  const lock = useRef(false);
  const [isMutating, setIsMutating] = useState(false);

  const mutate = async (
    payload: { id: string; updates: Partial<LivingItem> } | string,
    updatesParam?: Partial<LivingItem>
  ) => {
    if (lock.current) return null;
    lock.current = true;
    setIsMutating(true);
    const items = rawItems || [];
    let targetId: string;
    let updates: Partial<LivingItem>;

    if (typeof payload === "string") {
      targetId = payload;
      updates = updatesParam || {};
    } else {
      targetId = payload.id;
      updates = payload.updates;
    }

    try {
      const result = await updateInventoryItemAction(targetId, updates);
      if (!result.success) throw new Error(result.error);
      await updateData(
        items.map((item) =>
          item.id === targetId ? (result.data as LivingItem) : item
        )
      );
      return { id: targetId, updates };
    } finally {
      lock.current = false;
      setIsMutating(false);
    }
  };

  return {
    mutate,
    mutateAsync: mutate,
    isMutating,
  };
}

/**
 * ❌ [4. 자산 삭제 뮤테이션 훅]
 */
export function useDeleteItem() {
  const { data: rawItems, updateData } = useDataStore<LivingItem[]>({
    key: "inventory",
    fetcher: listInventoryAction,
  });
  const lock = useRef(false);
  const [isMutating, setIsMutating] = useState(false);

  const mutate = async (payload: { id: string } | string) => {
    if (lock.current) return null;
    lock.current = true;
    setIsMutating(true);
    const items = rawItems || [];
    const targetId = typeof payload === "string" ? payload : payload.id;

    try {
      const result = await deleteInventoryItemAction(targetId);
      if (!result.success) throw new Error(result.error);
      await updateData(
        items.filter((item) => item.id !== targetId) as LivingItem[]
      );
      return { id: targetId, res: true };
    } finally {
      lock.current = false;
      setIsMutating(false);
    }
  };

  return {
    mutate,
    mutateAsync: mutate,
    isMutating,
  };
}

export function useConsumeItem() {
  const { data: rawItems, updateData } = useDataStore<LivingItem[]>({
    key: "inventory",
    fetcher: listInventoryAction,
  });
  const lock = useRef(false);
  const [isMutating, setIsMutating] = useState(false);

  const mutate = async (
    payload: { id: string; source?: "INVENTORY" | "MEDICINE" } | string
  ) => {
    if (lock.current) return null;
    lock.current = true;
    setIsMutating(true);
    const id = typeof payload === "string" ? payload : payload.id;
    const source = typeof payload === "string" ? "INVENTORY" : payload.source;
    try {
      const result = await consumeInventoryItemAction(id, source);
      if (!result.success) throw new Error(result.error);
      await updateData(
        (rawItems || []).map((item) =>
          item.id === id ? (result.data as LivingItem) : item
        )
      );
      return result.data;
    } finally {
      lock.current = false;
      setIsMutating(false);
    }
  };

  return { mutate, mutateAsync: mutate, isMutating };
}
