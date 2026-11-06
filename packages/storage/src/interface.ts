// 📂 packages/storage/src/interface.ts

/**
 * 🔒 [Storage Driver Contract]
 * - 어떤 하위 저장소 플랫폼(Firestore, Google Drive 등)이든 이 계약 규격을 만족해야 합니다.
 * - any를 철저히 배제하고, 어떠한 가변 데이터 명세에도 흔들리지 않도록 제네릭(<T>) 파이프라인으로 묶어냅니다.
 */
export interface StorageDriverContract {
  read: <T>(locationKey: string) => Promise<T | null>;
  write: <T>(locationKey: string, data: T) => Promise<{ success: boolean }>;
}
