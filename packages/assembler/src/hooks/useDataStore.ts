// 📂 packages/assembler/src/hooks/useDataStore.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { dbLocal } from "../adapters/localStore";

interface UseDataStoreOptions<T> {
  key: string;
  fetcher?: () => Promise<T | null>;
  updater?: (newData: T) => Promise<void | T>;
}

export function useDataStore<T>(options: UseDataStoreOptions<T>) {
  const key = options?.key;
  const fetcher = options?.fetcher;
  const updater = options?.updater;
  const { data: session, status } = useSession();
  const scopedKey = `${session?.user?.id || "guest"}:${key}`;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const dataRef = useRef<T | null>(null);
  const revisionRef = useRef(0);

  // ✅ fetcher/updater를 ref로 관리 → 의존성 배열에서 제외
  const fetcherRef = useRef(fetcher);
  const updaterRef = useRef(updater);

  useEffect(() => {
    fetcherRef.current = fetcher;
    updaterRef.current = updater;
  }, [fetcher, updater]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setData(null);
      setLoading(false);
      return;
    }
    let isMounted = true;
    let aborted = false;
    setData(null);
    setLoading(true);

    async function syncData() {
      if (!key) {
        console.warn("[useDataStore] 유효하지 않은 key입니다냥!");
        setLoading(false);
        return;
      }

      // ① IndexedDB 로컬 캐시 우선 렌더링
      try {
        const cached = await dbLocal.get<T>(scopedKey, "master_document");
        if (!aborted && cached && isMounted) {
          setData(cached);
        }
      } catch (err) {
        console.warn(`[useDataStore] 캐시 읽기 실패:`, err);
      } finally {
        // IndexedDB 확인이 끝나면 즉시 화면을 연다. 원격 갱신은 아래에서 백그라운드로 계속한다.
        if (!aborted && isMounted) setLoading(false);
      }

      // ② 서버 액션 호출 (한 번만!)
      if (fetcherRef.current && !aborted) {
        const revisionAtRequest = revisionRef.current;
        try {
          const remote = await fetcherRef.current();
          if (
            !aborted &&
            remote !== null &&
            remote !== undefined &&
            isMounted &&
            revisionRef.current === revisionAtRequest
          ) {
            setData(remote);
            await dbLocal.set(scopedKey, "master_document", remote);
          }
        } catch (error) {
          console.error(`[useDataStore] ${key} 동기화 실패:`, error);
        }
      }
    }

    syncData();

    return () => {
      isMounted = false;
      aborted = true;
    };
  }, [key, scopedKey, status]);

  useEffect(() => {
    const eventName = `ink-data:${scopedKey}`;
    const sync = (event: Event) => setData((event as CustomEvent<T>).detail);
    window.addEventListener(eventName, sync);
    return () => window.removeEventListener(eventName, sync);
  }, [scopedKey]);

  const updateData = useCallback(
    async (newData: T) => {
      if (!key) return;

      const previous = dataRef.current;
      revisionRef.current += 1;
      dataRef.current = newData;
      setData(newData);
      await dbLocal.set(scopedKey, "master_document", newData);
      window.dispatchEvent(
        new CustomEvent(`ink-data:${scopedKey}`, { detail: newData })
      );

      if (updaterRef.current) {
        try {
          await updaterRef.current(newData);
        } catch (error) {
          dataRef.current = previous;
          setData(previous);
          await dbLocal.set(scopedKey, "master_document", previous);
          window.dispatchEvent(
            new CustomEvent(`ink-data:${scopedKey}`, { detail: previous })
          );
          console.error(`[useDataStore] ${key} 업데이트 실패:`, error);
          throw error;
        }
      }
    },
    [key, scopedKey]
  );

  return { data, updateData, loading };
}
