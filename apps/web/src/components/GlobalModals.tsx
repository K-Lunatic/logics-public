// 📂 apps/web/src/components/GlobalModals.tsx
"use client";

import { useInkChatSettings } from "@/context/InkChatSettingsProvider";
import { SettingsModal } from "@/features/assistant/SettingsModal";
import { CustomToolBuilderModal } from "@/features/tools/CustomToolBuilderModal";
import { InkChatLauncher } from "@/features/assistant/InkChatLauncher";
import { OnboardingGate } from "@/features/onboarding/OnboardingGate";


// 🚀 [Pure Bone] 무인자 표준 훅 수입!
import { useToolManager, dbLocal } from "@ink/assembler";

export function GlobalModals() {

  const { 
    isSettingsOpen,
    isToolBuilderOpen, setIsToolBuilderOpen,
  } = useInkChatSettings();

  return (
    <OnboardingGate>
      <InkChatLauncher />
      {isSettingsOpen && <SettingsModal />}

      {isToolBuilderOpen && (
        <ToolBuilderModalHost onClose={() => setIsToolBuilderOpen(false)} />
      )}
    </OnboardingGate>
  );
}

function ToolBuilderModalHost({ onClose }: { onClose: () => void }) {
  const { activeTools, importToolCode } = useToolManager();

  return (
    <CustomToolBuilderModal
      isOpen
      onClose={onClose}
      storedTools={activeTools}
      onRegisterTool={async (newTool) => {
          try {
            // 🚀 2. [0ms UI 반응성]: 로컬 캐시 메모리 덤프
            await dbLocal.set("custom_tools", newTool.id, newTool);

            // 🚀 3. [FIX]: 클라이언트 Direct dbRemote.set 제거!
            // useToolManager 내부의 표준 동기화 메서드를 사용하거나
            // 백엔드 서버 액션을 통해 users/${secureId}/tools/master_document 안전 적재 단행
            const exportCode = btoa(encodeURIComponent(JSON.stringify(newTool)));
            await importToolCode(exportCode);
            
            alert("✅ 커스텀 툴이 장부에 성공적으로 덤프되었다냥! 🐾");
            onClose();
          } catch (err) {
            console.error("🚨 툴 등록 파이프라인 크래시:", err);
            alert("🚨 도구 등록 중 에러가 발생했다냥.");
          }
      }}
    />
  );
}
