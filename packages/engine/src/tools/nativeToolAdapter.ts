import { z } from "zod";
import { StoredTool, PipelineBlock, InputParamDef, DataType } from "./types";

export interface NativeToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  scope?: "system" | "user";
  defaultOutputKeys?: string[];
}

/**
 * 🛠️ [Zod Schema Introspector]
 * Zod 객체 스키마를 파싱하여 StoredTool의 `inputParams` 규격으로 즉시 변환합니다.
 */
export function parseZodToInputParams(zodSchema: z.ZodObject<any>): InputParamDef[] {
  const shape = zodSchema.shape;
  const inputParams: InputParamDef[] = [];

  for (const [key, schemaObj] of Object.entries(shape)) {
    let rawSchema: any = schemaObj;
    let required = true;

    // 🚀 [TS2740 해결]: ZodOptional 및 ZodDefault 안전 unwrapping
    if (rawSchema instanceof z.ZodOptional) {
      required = false;
      rawSchema = rawSchema.unwrap();
    } else if (rawSchema instanceof z.ZodDefault) {
      required = false;
      rawSchema = rawSchema._def.innerType;
    }

    let type: DataType = "string";
    if (rawSchema instanceof z.ZodNumber) type = "number";
    else if (rawSchema instanceof z.ZodBoolean) type = "boolean";
    else if (rawSchema instanceof z.ZodObject || rawSchema instanceof z.ZodArray) type = "json";

    const description = rawSchema.description || `${key} 매개변수`;

    inputParams.push({
      id: `ip-native-${key}-${Date.now()}`,
      key,
      type,
      required,
      description,
    });
  }

  return inputParams;
}

/**
 * 🚀 [네이티브 툴 승격 엔진 (Native -> StoredTool Converter)]
 * 하드코딩된 TS 툴을 완전한 StoredTool JSON 블루프린트로 변환합니다.
 */
export function convertNativeToStoredTool(def: NativeToolDefinition): StoredTool {
  const inputParams = parseZodToInputParams(def.parameters);

  // 1. INPUT 블록 자동 생성
  const inputBlock: PipelineBlock = {
    id: "step-input-native",
    type: "INPUT",
    title: `1. ${def.name} 입력 파라미터 규격 (INPUT)`,
    inputParams,
  };

  // 2. OPERATION 블록 (네이티브 커널 타격 레이어)
  const opArgs: Record<string, string> = {};
  inputParams.forEach((param) => {
    opArgs[param.key] = `{{inputs.${param.key}}}`;
  });

  const operationBlock: PipelineBlock = {
    id: "step-op-native",
    type: "OPERATION",
    title: `2. 네이티브 엔진 execution 타격 (OPERATION)`,
    toolId: def.id,
    toolArgs: opArgs,
  };

  // 3. OUTPUT 블록 (응답 매핑 자동 도출)
  const outputKeys = def.defaultOutputKeys || ["status", "result"];
  const outputMapping = outputKeys.map((key, idx) => ({
    id: `om-native-${idx}`,
    returnKey: key,
    sourceExpr: `{{steps.step-op-native.${key}}}`,
  }));

  const outputBlock: PipelineBlock = {
    id: "step-output-native",
    type: "OUTPUT",
    title: `3. 최종 리턴 직렬화 (OUTPUT)`,
    outputMapping,
  };

  return {
    id: def.id,
    name: def.name,
    scope: def.scope || "system",
    blocks: [inputBlock, operationBlock, outputBlock],
    createdAt: new Date().toISOString(),
    status: "ACTIVE",
  };
}
