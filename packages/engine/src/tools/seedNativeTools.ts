import { z } from "zod";
import { convertNativeToStoredTool } from "./nativeToolAdapter";
import { StoredTool } from "./types";

/**
 * 📦 기존 네이티브 TypeScript 툴들의 레지스트리 목록
 */
export const NATIVE_TOOL_DEFINITIONS = [
  {
    id: "sys-environment-get-weather",
    name: "environment.getWeather",
    description: "특정 도시의 현재 또는 미래 시간별 기상청 날씨를 조회합니다.",
    parameters: z.object({
      city: z.string().describe("조회할 도시명 (예: 충주시, 서울특별시)"),
      date: z.string().optional().describe("조회 날짜 YYYY-MM-DD, 생략하면 오늘"),
      time: z.string().optional().describe("조회 시각 HH:mm, 생략하면 현재 시각"),
    }),
    scope: "system" as const,
    defaultOutputKeys: ["status", "city", "temp", "condition"],
  },
  // 💡 향후 추가되는 네이티브 TS 툴들도 여기에 선언만 하면 자동으로 StoredTool화됩니다냥!
];

/**
 * ⚡ 앱 초기화 시 네이티브 툴을 StoredTool JSON 규격으로 변환하여 반환
 */
export function getNativeToolsAsStoredTools(): StoredTool[] {
  return NATIVE_TOOL_DEFINITIONS.map((def) => convertNativeToStoredTool(def));
}
