export interface MediaComponent {
  type: "table" | "image" | "checklist" | "action_button" | "input_form";
  data: any;
  url?: string;
  caption?: string;
}

export function normalizeModelReply(text: string): {
  message: string;
  components: MediaComponent[];
} {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned.startsWith("{")) return { message: cleaned, components: [] };
  try {
    const parsed = JSON.parse(cleaned) as {
      message?: unknown;
      components?: unknown;
    };
    return {
      message:
        typeof parsed.message === "string" ? parsed.message.trim() : cleaned,
      components: Array.isArray(parsed.components)
        ? parsed.components as MediaComponent[]
        : [],
    };
  } catch {
    return { message: cleaned, components: [] };
  }
}

// 🚀 최종 인식-행동-회고 단계를 거쳐 사용자와 인벤토리 스레드에 전달될 완성형 데이터 규격
export interface SynthesizedResponse {
  rawResult: any; // 툴이 실제로 실행되어 반환한 DB 및 API Raw 데이터
  evaluation: {
    isSuccessful: boolean;
    reason: string; // 성공 및 실패에 대한 AI의 데이터 정합성 판단 결과
    impact: string; // 이 작업이 내 공간, 냉장고, 살림 인프라에 미친 실질적 영향 기술
  };
  components: MediaComponent[]; // 스토리지 용량을 아끼는 외부 이미지, 표, 체크리스트 데이터
  message: string; // 사용자가 대화창에서 보게 될 Ink 고양이의 친절한 최종 브리핑 답변
}
