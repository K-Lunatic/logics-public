// 📂 packages/engine/src/curation/engineConfig.ts

/**
 * 🛡️ [Type Guard] 순수 도메인 패키지가 @types/node 종속성 없이도
 * process.env를 안전하게 추론할 수 있도록 가벼운 앰비언트 선언을 주입한다냥!
 */
declare const process: {
  env: Record<string, string | undefined>;
};

export interface EngineConfig {
  holidayApiKey: string;
  weatherApiKey: string;
  googleAiApiKey: string;
  google: {
    clientId: string;
    clientSecret: string;
  };
}

let config: EngineConfig | null = null;

/**
 * 🚀 코어 엔진 설정 자동 초기화 장부
 */
export const initializeEngine = (overrides?: Partial<EngineConfig>) => {
  if (config) return;

  const isBrowser = typeof window !== "undefined";

  const scan = (key: string): string => {
    // 🔑 어떤 키가 진짜 서버 전용 '시크릿 키'인지 명확하게 감옥을 세운다냥!
    const secretKeys = [
      "HOLIDAY_API_KEY", 
      "WEATHER_API_KEY", 
      "GOOGLE_GENERATIVE_AI_API_KEY", 
      "GOOGLE_CLIENT_SECRET"
    ];
    const isSecret = secretKeys.includes(key);

    // 서버 전용 키는 브라우저 번들에서 읽지 않는다.
    if (isBrowser && isSecret) return "";

    // 🚀 [구원 투수]: 유실되었던 백엔드/프론트엔드 환경 변수 인출 단자 복원 완수!
    // Next.js의 규칙에 맞게 원본 이름(key)과 브라우저 노출용(NEXT_PUBLIC_) 장부를 모두 뒤진다냥.
    return (
      process.env[key] || 
      process.env[`NEXT_PUBLIC_${key}`] || 
      ""
    );
  };

  config = {
    holidayApiKey: overrides?.holidayApiKey || scan("HOLIDAY_API_KEY"),
    weatherApiKey: overrides?.weatherApiKey || scan("WEATHER_API_KEY"),
    googleAiApiKey: overrides?.googleAiApiKey || scan("GOOGLE_GENERATIVE_AI_API_KEY"),
    google: {
      clientId: overrides?.google?.clientId || scan("GOOGLE_CLIENT_ID"),
      clientSecret: overrides?.google?.clientSecret || scan("GOOGLE_CLIENT_SECRET"),
    },
  };

};

export const getConfig = (): EngineConfig => {
  if (!config) {
    initializeEngine();
    if (!config)
      throw new Error("🚨 코어 엔진 설정 장부 강제 초기화에 실패했습니다.");
  }
  return config;
};

export const ensureServerEngine = () => {
  try {
    initializeEngine();
  } catch (e) {
    // 엔진이 이미 초기화되었거나 설정이 완료된 상태면 무시
  }
};
