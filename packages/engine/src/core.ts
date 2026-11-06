// 📂 packages/engine/src/core.ts
import { IdentifiableEngineContract } from "./types";

export const FunctionalCoreEngine = {
  /**
   * 📦 [1. 제네릭 원자적 리스트 차분 연산기 - calculateDeltaUpdates]
   * - 전철 흡수: 데이터 명세를 모르는 청정 상태에서, 타겟 아이템의 수량 차분과 프로퍼티 동적 확장을 처리합니다.
   * - 안전 가드: 수량이 음수가 되지 않도록 최소 0 하한선 가드 연산을 수학적으로 보장합니다.
   */
  calculateDeltaUpdates<T extends IdentifiableEngineContract>(
    currentList: T[],
    targetId: string,
    quantityDiff: number,
    propertyUpdates: Partial<T>
  ): T[] {
    return currentList.map((item) => {
      if (item.id !== targetId) return item;

      return {
        ...item,
        ...propertyUpdates,
        quantity: Math.max(0, item.quantity + quantityDiff),
        updatedAt: new Date().toISOString(),
      };
    });
  },

  /**
   * 🛡️ [2. 장부 무결성 검증 필터 - verifyInventoryIntegrity]
   * - 명세와 관계없이 리스트 장부 내 수량에 손상이 없는지 칼같이 수학적 검증을 단행합니다.
   */
  verifyInventoryIntegrity<T extends IdentifiableEngineContract>(list: T[]): boolean {
    return list.every((item) => item.quantity >= 0 && !!item.id);
  },

  /**
   * 🗓️ [3. 순수 결정론적 날짜 격자 매트릭스 계산기 - computeMonthCalendarGrid]
   * - 기상청 API나 외역 통신 없이, 오직 달력 기하학 수학을 통해 특정 년/월의 공백과 날짜 격자 매트릭스 배열만 계산해 리턴합니다.
   */
  computeMonthCalendarGrid(year: number, month: number): (number | null)[] {
    const firstDayIndex = new Date(year, month - 1, 1).getDay();
    const totalDays = new Date(year, month, 0).getDate();
    const days: (number | null)[] = [];

    // 달력 시작 전 공백 격자 채우기
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    // 진짜 날짜 채우기
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  },

  /**
   * 🚀 [4. 비종속형 동적 날짜 그룹핑 분배기 - groupItemsByDate]
   * - 가변적인 데이터의 결합을 깨기 위해, 호출자가 공급한 조건 단자 함수(dateExtractor)를 토대로 
   * 리스트를 날짜별 스트림 격자로 유연하게 그룹핑하는 제네릭 라이브러리입니다.
   */
  groupItemsByDate<T>(items: T[], dateExtractor: (item: T) => string): Record<string, T[]> {
    return items.reduce((acc, item) => {
      const dateKey = dateExtractor(item);
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  },

  /**
   * ⚠️ [5. 비침습형 선입선출(FIFO) 임박 대안 배치 추천 엔진 - findUrgentAlternativeBatch]
   * - 기존 AI 패키지 깊은 곳에 하드코딩되어 결합도를 깨트리던 선입선출(FIFO) 핵심 비즈니스 연산 로직을 제네릭으로 추상화 수거 완수!
   * - 규칙: 동일 이름군 내에서 현재 소모 대상보다 유통기한/소비기한이 더 긴박한 대안 배치가 있는지 리스트를 역순회하여 계산 축출합니다.
   */
  findUrgentAlternativeBatch<T extends IdentifiableEngineContract>(params: {
    currentList: T[];
    targetItem: T;
    // 🚀 [비종속 단자]: 패키지 내부에 '이름'과 '소비기한 필드'를 하드코딩하지 않기 위해 쉘이 넘겨줄 문자열 추출 단자 수령
    nameExtractor: (item: T) => string;
    expirationExtractor: (item: T) => string | undefined;
  }): T | null {
    const targetName = params.nameExtractor(params.targetItem);
    const targetExp = params.expirationExtractor(params.targetItem);

    const urgentFound = params.currentList.find((item) => {
      if (item.id === params.targetItem.id) return false; // 자기 자신 배치 패스
      if (item.quantity <= 0) return false; // 품절 패스

      const isSameName = params.nameExtractor(item).toLowerCase() === targetName.toLowerCase();
      if (!isSameName) return false;

      const alternativeExp = params.expirationExtractor(item);
      if (!alternativeExp) return false; // 유통기한 추적 데이터가 없는 배치는 대안 경고 대상에서 제외

      if (!targetExp) return true; // 현재 찍은 건 소비기한이 없는데 보관함 내 대안 배치는 날짜가 박혀있다면 그게 무조건 우선순위!
      return alternativeExp < targetExp; // 더 급한 유통기한 배치 발견!
    });

    return urgentFound || null;
  }
};
