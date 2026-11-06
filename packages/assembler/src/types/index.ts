// packages/assembler/src/types/index.ts
export type BlockType = "INPUT" | "OPERATION" | "CODE" | "OUTPUT";
export type DataType = "string" | "number" | "boolean" | "json" | "file";

export interface InputParamDef {
  id: string;
  key: string;
  type: DataType;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

export interface OutputMappingDef {
  id: string;
  returnKey: string;
  sourceExpr: string;
}

export interface PipelineBlock {
  id: string;
  type: BlockType;
  title: string;
  inputParams?: InputParamDef[];
  toolId?: string;
  toolArgs?: Record<string, string>;
  customCode?: string;
  outputMapping?: OutputMappingDef[];
}

export interface StoredTool {
  id: string;
  name: string;
  description?: string;
  scope: "system" | "user";
  userId?: string;
  blocks: PipelineBlock[];
  createdAt: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface PipelineContext {
  userId: string;
  inputs: Record<string, unknown>;
  steps: Record<string, Record<string, unknown>>;
}
