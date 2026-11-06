"use client";

import { Button, Card } from "@/components/ui";
// 🚀 [교정 완료]: 코어 엔진에서 자산 도메인 타입을 명확하게 수입냥!
import { LivingItemPayload } from "@ink/engine";

interface PillTrackerProps {
  // 💡 [ESLint 해결]: 오염된 any[]를 제거하고 정형화된 LivingItemPayload 구조체 배열로 명시냥!
  medicines: LivingItemPayload[];
  // 💡 [ESLint 해결]: 콜백 인자 또한 단일 LivingItemPayload 규격으로 정확히 바인딩 완료냥!
  onTakePill: (item: LivingItemPayload) => void;
  isMutating?: boolean;
}

export function PillTracker({
  medicines,
  onTakePill,
  isMutating = false,
}: PillTrackerProps) {
  return (
    <Card title="💊 데일리 복약 트래커">
      {medicines.length === 0 ? (
        <p className="text-sm text-gray-400">등록된 약품이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {medicines.map((pill) => (
            <div
              key={pill.id}
              className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100"
            >
              <div>
                <strong className="text-gray-800">{pill.name}</strong>
                <p className="text-xs text-gray-500 mt-0.5">
                  잔여: {pill.quantity} {pill.unit || "개"}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onTakePill(pill)}
                disabled={pill.quantity <= 0 || isMutating}
              >
                {pill.quantity <= 0 ? "소진됨" : "1개 복용"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
