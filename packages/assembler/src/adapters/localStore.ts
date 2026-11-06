function getIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB를 사용할 수 없는 환경입니다."));
    }
    const request = window.indexedDB.open("INK_LOCAL_CACHE", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("kv_store")) {
        request.result.createObjectStore("kv_store");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const dbLocal = {
  get: async <T>(category: string, path: string): Promise<T | null> => {
    try {
      const db = await getIDB();
      return new Promise((resolve) => {
        const request = db
          .transaction("kv_store", "readonly")
          .objectStore("kv_store")
          .get(`${category}:${path}`);
        request.onsuccess = () => resolve(request.result?.data ?? null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },
  set: async <T>(category: string, path: string, data: T): Promise<void> => {
    try {
      const db = await getIDB();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction("kv_store", "readwrite")
          .objectStore("kv_store")
          .put(
            { id: path, data, updatedAt: Date.now() },
            `${category}:${path}`,
          );
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // 원격 MySQL 동기화는 계속 진행한다.
    }
  },
};
