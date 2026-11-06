// packages/assembler/src/engine/schema.ts
import { StoredTool } from "../types";

export interface LLMToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

export function toLLM(tools: StoredTool[]): LLMToolSpec[] {
  return tools.map((tool) => {
    const inputBlock = tool.blocks.find((b) => b.type === "INPUT");
    const params = inputBlock?.inputParams || [];

    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];

    params.forEach((param) => {
      let jsonType = "string";
      if (param.type === "number") jsonType = "number";
      if (param.type === "boolean") jsonType = "boolean";
      if (param.type === "json") jsonType = "object";

      properties[param.key] = {
        type: jsonType,
        description: param.description || `'${param.key}' parameter`,
      };

      if (param.required) {
        required.push(param.key);
      }
    });

    return {
      name: tool.id.replace(/[^a-zA-Z0-9_-]/g, "_"),
      description: `${tool.name} (${tool.blocks.map((b) => b.title).join(" -> ")})`,
      parameters: {
        type: "object",
        properties,
        required,
      },
    };
  });
}
