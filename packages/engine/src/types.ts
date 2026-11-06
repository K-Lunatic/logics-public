// 📂 packages/engine/src/types.ts

/**
 * 🔒 [Minimal Engine Contract Spec]
 * - 엔진은 엔티티가 사과인지 옷인지 상관하지 않습니다.
 * - 오직 원자적 비교와 배칭 연산을 위해 고유 식별자(id)와 수량(quantity), 가동 시간(updatedAt)의 존재만 계약으로 보장받습니다.
 */
export interface IdentifiableEngineContract {
  id: string;
  quantity: number;
  updatedAt: string;
}

export * from "./schemas";
