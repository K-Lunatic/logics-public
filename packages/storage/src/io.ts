// 📂 packages/storage/src/io.ts
import { StorageDriverContract } from "./interface";

/**
 * 🔒 [Universal Smart Buffer & Lock Store]
 * - any를 배제하고 unknown으로 데이터를 묶어 리스트([]) 단위 캐싱 매트릭스를 제어합니다.
 */
const storageMemoryCache = new Map<string, unknown[]>();
const storageWriteLockGuard = new Map<string, boolean>();

export interface MultiStageResponse<T> {
  stage: "CACHE_OPTIMISTIC" | "STORAGE_CONFIRMED";
  success: boolean;
  data: T[];
  message: string;
}

export const UnifiedStorageIO = {
  /**
   * 📥 [단일 통합 READ 관문]
   */
  async executeRead<T>(
    driver: StorageDriverContract,
    domainLocation: string,
    identityKey: string,
    forceRefresh = false
  ): Promise<T[] | null> {
    if (!identityKey) return [];
    const compoundKey = `${domainLocation}_${identityKey}`;

    const isLocked = storageWriteLockGuard.get(compoundKey) ?? false;
    const hasCache = storageMemoryCache.has(compoundKey);

    if ((isLocked || !forceRefresh) && hasCache) {
      return (storageMemoryCache.get(compoundKey) as T[]) || [];
    }

    try {
      const remoteData = await driver.read<T[]>(compoundKey);
      if (remoteData !== null) {
        // 모든 데이터는 리스트로 강제 모아서 안전 수령 보장
        storageMemoryCache.set(compoundKey, Array.isArray(remoteData) ? remoteData : [remoteData]);
      }
      return (storageMemoryCache.get(compoundKey) as T[]) || [];
    } catch (error) {
      console.error(`🔥 [Storage Read Crash] '${compoundKey}':`, error);
      return (storageMemoryCache.get(compoundKey) as T[]) || [];
    }
  },

  /**
   * 📤 [2단계 원자적 낙관적 업데이트 실행 파이프라인]
   * - 전철 대폭 수용: AsyncGenerator 제네릭 명세를 통해 단 한 번의 호출로 2단계 리턴을 달성합니다.
   * - 로직: 모든 엔티티 데이터는 리스트([]) 형태로 결합 수렴되어 계산됩니다.
   */
  async *executeOptimisticWrite<T>(
    driver: StorageDriverContract,
    domainLocation: string,
    identityKey: string,
    // 🚀 [리스트 변환 연산 위임 단자]: 어떤 모양의 리스트든 가공할 계산 규칙 함수를 인자로 수령
    mutationCalculator: (currentList: T[]) => T[]
  ): AsyncGenerator<MultiStageResponse<T>, void, unknown> {
    if (!identityKey) {
      yield { stage: "CACHE_OPTIMISTIC", success: false, data: [], message: "식별자 유실" };
      return;
    }
    const compoundKey = `${domainLocation}_${identityKey}`;

    // 1. 기존 리스트 스냅샷 확보 (리스트 모아서 처리하는 철칙 준수)
    const currentList = (storageMemoryCache.get(compoundKey) as T[]) || [];

    // 2. 🚀 [1단계: 낙관적 업데이트 단자] 
    // 계산기 함수를 거쳐 메모리 캐시를 즉시 갱신하고, 영속화 전 락을 강하게 걸어 잠급니다.
    storageWriteLockGuard.set(compoundKey, true);
    const optimisticList = mutationCalculator(currentList);
    storageMemoryCache.set(compoundKey, optimisticList);

    // 🎯 [첫 번째 리턴 방출]: 캐시가 선제 변동되었다는 사실과 최신 스냅샷 배열을 즉시 토출(0ms)
    yield {
      stage: "CACHE_OPTIMISTIC",
      success: true,
      data: optimisticList,
      message: `⚡ [낙관적 가드] '${domainLocation}' 메모리 버퍼 선제 반영 완료.`
    };

    // 3. 🚀 [2단계: 실제 물리 저장소 영속화 안착 트랙]
    try {
      console.log(`☁️ [Storage Shell] '${compoundKey}' 실제 스토리지 원격 기입 마감 돌입.`);
      
      // 구체적인 플랫폼 SDK 없이 드라이버 계약체에 리스트 일괄 기입
      await driver.write<T[]>(compoundKey, optimisticList);

      // 🎯 [두 번째 리턴 방출]: 실제 저장소 안착 성공 리턴과 최종 확정 배열 토출
      yield {
        stage: "STORAGE_CONFIRMED",
        success: true,
        data: optimisticList,
        message: `✅ [최종 안착] '${domainLocation}' 원격 스토리지 영속화 및 정합성 보존 직인 마감 완수.`
      };

    } catch (err) {
      console.error(`🚨 [Storage Crash Rollback] '${compoundKey}' 영속화 실패. 롤백을 단행합니다:`, err);
      
      // 예외 복구 트랙: 원격 저장 실패 시 메모리 캐시를 변경 전 원래 리스트 스냅샷으로 즉시 원상복구
      storageMemoryCache.set(compoundKey, currentList);
      
      yield {
        stage: "STORAGE_CONFIRMED",
        success: false,
        data: currentList, // 원래 복구된 데이터 반환
        message: `❌ [인프라 안착 붕괴] 원격 저장 실패로 장부를 원래 스냅샷으로 롤백했습니다.`
      };
      throw err;
    } finally {
      // 4. 연산 파이프라인 통과 완료 시 안전하게 국경선 락 해제
      storageWriteLockGuard.set(compoundKey, false);
    }
  }
};
