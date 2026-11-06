# 🖋️ AI INK (Blank.) Core Engine Reference Manual
> **자취방 물류·일정 커널 가이드 장부**


이 명세서는 `@ink/engine`, `@ink/ai`, `@ink/storage` 핵심 독립 패키지(모노레포 커널)의 공통 타입 구조, 주요 함수, 그리고 인프라 간의 유기적인 연동법을 집대성한 마스터 레퍼런스 문서입니다.

---

## 🏗️ 1. 모노레포 전체 아키텍처 지도

전체 시스템은 **클린 아키텍처(Clean Architecture)** 사상에 의거하여 프레임워크(Next.js)와 인프라(Firestore/Drive)의 변동에 비비안 코어 비즈니스 로직이 오염되지 않도록 완벽하게 분리 격리되어 있습니다.

```text
[ 껍데기 레이어: apps/web (Next.js Server Actions) ]
│
▼ (추상 인터페이스 Context 주입)
┌──────────────────────────────────────────────────────────┐
│             AI INK Core Kernel (Monorepo)                │
│                                                          │
│  ┌─────────────────┐ 🛠️ Tools  ┌──────────────────────┐  │
│  │   @ink/engine   │──────────>│       @ink/ai        │  │
│  │ (Domain & Tool) │<──────────│(Orchestrator/Driver) │  │
│  └─────────────────┘           └──────────────────────┘  │
│           │                                              │
│           ▼ (DIP 의존성 역전 구조 읽기/쓰기)                   │
│  ┌─────────────────┐                                     │
│  │  @ink/storage   │                                     │
│  │ (Unified I/O)   │                                     │
│  └─────────────────┘                                     │
└──────────────────────────────────────────────────────────┘
```

---

## 🍏 2. @ink/engine : 도메인 장부 및 기능

> 시스템의 코어이며, 자산과 일정의 데이터 정합성을 물리적으로 책임지는 레이어입니다.

### (1) 핵심 데이터 타입 명세 (Source of Truth)

  Zod 통합 유니온 스키마(`livingItemSchema`)를 정적 TypeScript 규격으로 완전 추상화한 인터페이스 명세입니다.

```typescript
export type DomainType = "FOOD" | "MEDICINE" | "CLOTHES" | "BOOK" | "HOUSEHOLD" | "ETC";
export type UnitType = "개" | "알" | "포" | "g" | "kg" | "ml" | "L" | "장" | "박스" | "권";
export type ItemStatus = "INBOX" | "STORED" | "CONSUMED" | "DISCARDED";

// 통합 물품 자산 규격
export interface LivingItem {
  id: string;
  name: string;
  quantity: number;
  unit: UnitType;
  sku?: string;
  location?: string;
  locationId: string | null;
  status: ItemStatus;
  price?: number;
  imageUrl?: string | null;
  tags: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
  expirationDate?: string;
  purchaseDate?: string;
  domainType: DomainType;
}

// 단일 스케줄 이벤트 규격
export interface SingleScheduleEvent {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  category: "WORK" | "UTILITY" | "PERSONAL" | "HOLIDAY" | "GLOBAL";
  note?: string;
  isAllDay?: boolean;
}

// 스케줄 마스터 페이로드
export interface AIMasterSchedulePayload {
  monthEvents: SingleScheduleEvent[];
  biWeekMilestones: string[];
  weekRoutines: Record<string, unknown>;
}
```

### (2) 의존성 역전 전용 Context 인터페이스
엔진 내부의 도구들이 외부 스토리지나 로그에 Raw 상태로 결합하지 않도록 묶어주는 Context 명세입니다.


```typescript
export interface UniversalToolContext {
  userId: string;
  checkAbort: () => void;                      // 유저 긴급 롤백 중단선 감지 단자
  log: (msg: string) => void;                  // 실시간 프로그레스 상태 스트리밍 버퍼
  getInventory: () => LivingItem[];            // 트랜잭션 도중 트래킹되는 로컬 인벤토리 스냅샷
  setInventory: (data: LivingItem[]) => void;  // 인벤토리 상태 변경 플래그 격발
  getSchedule: () => SingleScheduleEvent[];    // 일정 스냅샷 추적
  setSchedule: (data: SingleScheduleEvent[]) => void;
  getWeatherFetcher?: (loc: string) => Promise<unknown>; // 기상 API 프록시 단자
}
```

## 🧠 3. @ink/ai : 적응형 인공지능 실행 커널

모델은 데이터 변경 계획만 제출합니다. 코드는 명시된 건수와 스키마를 검증한 뒤 완전한 계획만 순차 실행하므로, 저성능 모델이 일부 항목을 누락해도 부분 저장되지 않습니다.

```text
자연어 요청 계약
→ 지연된 도구 계획
→ 건수/스키마 검증과 누락 복구
→ 실제 도구 실행
→ 실행 결과 기반 응답
```

`resolveModelProfile()`은 모델 ID와 사용자 정책을 기준으로 문맥 길이, 최대 단계, 제한 시간, 누락 복구 횟수를 정합니다. 공급자는 AI SDK `LanguageModel`만 제공하므로 Gemini에서 로컬 OpenAI 호환 모델로 바뀌어도 실행 로직은 유지됩니다.

```typescript
const workflow = await AIEngineOrchestrator.runAgentWorkflow({
  model,
  modelId: "gemini-3.6-flash",
  capabilityMode: "AUTO",
  reliabilityMode: "RELIABLE",
  system,
  messages,
  tools,
});
```

## 💾 4. @ink/storage : 원자적 데이터 입출력 커널
데이터베이스 드라이버를 직접 호출하지 않고 최적화된 트랜잭션을 실행하는 무결성 스토리지 추상화 레이어입니다.

### (1) UnifiedStorageIO 객체
```typescript
executeRead<T>(driver: any, domain: string, userId: string): Promise<T | null>
```
역할: 지정된 스토리지 드라이버를 가동해 장부(배열 덩어리)를 비동기로 단 한 번만 안전하게 읽어옵니다.
비용 최적화 포인트: 개별 유저당 단 1개의 master_document에서만 읽기를 수행하므로 Firestore 읽기 비용 과금을 줄일 수 있습니다.
```typescript
executeOptimisticWrite<T>(driver: any, domain: string, userId: string, payloadGenerator: () => T): AsyncGenerator<WriteChunk>
```
역할: 동시성 충돌을 방지하기 위해 낙관적 락(Optimistic Lock) 기법의 비동기 제너레이터를 가동하여 파일 적재 진행 단계를 청크 단위로 안전하게 Flush 합니다.

사용법:
```TypeScript
const generator = UnifiedStorageIO.executeOptimisticWrite<LivingItem[]>(
  driver,
  "inventory",
  userId,
  () => updatedPayload
);

for await (const chunk of generator) {
  if (chunk.stage === "STORAGE_CONFIRMED" && !chunk.success) {
    throw new Error(chunk.message); // 저장 실패 시 원자적 롤백
  }
}
```


## 5. 실전 서버 액션 결합 표준 패턴 (Next.js 15+)
모든 단자를 합쳐 백엔드 서버 액션(*.actions.ts)을 구성할 때 반드시 반영해야 하는 IDOR 해킹 방어용 아키텍처 뼈대 양식입니다.

```TypeScript
"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchUniversalPayloadAction, saveUniversalPayloadAction } from "./core.actions";
import { LivingItem } from "@ink/engine";

async function getSecureUserIdOrThrow(): Promise<string> {
  const session = await getServerSession(authOptions);
  const secureId = (session?.user as { id?: string })?.id;

  if (!secureId) {
    throw new Error("비인가 트랜잭션 접근 시도가 감지되어 차단되었습니다.");
  }
  return secureId;
}

/**
 * 물품 자산 수정 액션 양식
 */
export async function updateInventoryItemAction(id: string, updates: Partial<LivingItem>) {
  const secureUserId = await getSecureUserIdOrThrow(); // 보안 가드 가동
  const list = await fetchUniversalPayloadAction<LivingItem[]>("inventory") || []; // 단일 읽기 통로 결합
  const updatedList = list.map(item => 
    item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
  ); // 비즈니스 밸브
  await saveUniversalPayloadAction("inventory", updatedList); // // 낙관적 원자성 반영

  return { success: true };
}
```
