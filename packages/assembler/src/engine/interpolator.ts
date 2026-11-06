// packages/assembler/src/engine/interpolator.ts
import { PipelineContext } from "../types";

export function resolve(expr: unknown, context: PipelineContext): unknown {
  if (typeof expr !== "string") return expr;
  const trimmed = expr.trim();

  // 단일 변수 객체/배열 원본 보존 치환 (예: "{{inputs.item}}")
  const singleMatch = trimmed.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
  if (singleMatch) {
    return getByPath(context, singleMatch[1]);
  }

  // 복합 텍스트 내 치환 (예: "결과: {{steps.step-1.status}}")
  return trimmed.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const val = getByPath(context, path);
    if (val === undefined || val === null) return "";
    return typeof val === "object" ? JSON.stringify(val) : String(val);
  });
}

function getByPath(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}
