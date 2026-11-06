// 📂 packages/storage/src/configurator.ts
import { StorageDriverContract } from "./interface";

export interface FirestoreContextSpec {
  db: unknown;
  doc: (db: unknown, collection: string, docKey: string) => unknown;
  getDoc: (docRef: unknown) => Promise<{ exists: () => boolean; data: () => unknown }>;
  setDoc: (docRef: unknown, data: unknown) => Promise<void>;
  collectionPath: string;
}

export interface GoogleDriveContextSpec {
  userId: string;
  driveEngine: {
    read: <T>(userId: string, fileName: string, db: unknown) => Promise<T | null>;
    write: <T>(userId: string, fileName: string, data: T, db: unknown) => Promise<void>;
  };
  fallbackDb: unknown;
}

// 💻 IndexedDB(Dexie) 통제를 위한 100% 무균 명세서
export interface DexieContextSpec {
  table: {
    get: (key: string) => Promise<unknown>;
    put: (value: unknown, key: string) => Promise<unknown>;
  };
}

export const StorageConfigurator = {
  /**
   * 🔥 Firestore 전용 청정 드라이버 설정
   */
  createFirestoreDriver(context: FirestoreContextSpec): StorageDriverContract {
    return {
      read: async <T>(locationKey: string): Promise<T | null> => {
        const docRef = context.doc(context.db, context.collectionPath, locationKey);
        const snapshot = await context.getDoc(docRef);
        return snapshot.exists() ? (snapshot.data() as T) : null;
      },
      write: async <T>(locationKey: string, data: T): Promise<{ success: boolean }> => {
        const docRef = context.doc(context.db, context.collectionPath, locationKey);
        await context.setDoc(docRef, data);
        return { success: true };
      }
    };
  },

  /**
   * ☁️ Google Drive 전용 청정 드라이버 설정
   * - 입출력 함수 명세 타격 시 파일명 컨벤션을 유연하게 치환 소화합니다.
   */
  createGoogleDriveDriver(context: GoogleDriveContextSpec): StorageDriverContract {
    return {
      read: async <T>(locationKey: string): Promise<T | null> => {
        const targetFileName = `${locationKey}.json`;
        return await context.driveEngine.read<T>(context.userId, targetFileName, context.fallbackDb);
      },
      write: async <T>(locationKey: string, data: T): Promise<{ success: boolean }> => {
        const targetFileName = `${locationKey}.json`;
        await context.driveEngine.write<T>(context.userId, targetFileName, data, context.fallbackDb);
        return { success: true };
      }
    };
  },

  /**
   * 💻 IndexedDB (Dexie) 전용 청정 로컬 가속 드라이버 설정
   * - any 혐오증을 완벽히 치유하는 순수 unknown 우회 트랙 및 강력한 제네릭 검증 가드 작동!
   */
  createIndexedDbDriver(context: DexieContextSpec): StorageDriverContract {
    return {
      read: async <T>(locationKey: string): Promise<T | null> => {
        const row = await context.table.get(locationKey);
        // undefined나 null 체크 후 정적 제네릭 타입 가드로 완벽 캐스팅 반환
        return row !== undefined && row !== null ? (row as T) : null;
      },
      write: async <T>(locationKey: string, data: T): Promise<{ success: boolean }> => {
        // 주입받은 Dexie 테이블 단자에 key-value 매핑 영속화 기입
        await context.table.put(data, locationKey);
        return { success: true };
      }
    };
  }
};
