// packages/assembler/src/utils/codec.ts
import { StoredTool } from "../types";

export function packTool(tool: StoredTool): string {
  const json = JSON.stringify(tool);
  return typeof window !== "undefined" ? btoa(encodeURIComponent(json)) : Buffer.from(json).toString("base64");
}

export function unpackTool(code: string): StoredTool {
  const json = typeof window !== "undefined" ? decodeURIComponent(atob(code)) : Buffer.from(code, "base64").toString("utf-8");
  return JSON.parse(json);
}
