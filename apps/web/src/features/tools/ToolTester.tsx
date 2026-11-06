// 📂 apps/web/src/components/widgets/dev/ToolTester.tsx
"use client";

import { useState, useMemo } from "react";

// 🚀 [Pure Bone] 존재하지 않는 레거시 액션 대신, 표준 훅과 파이프라인 연산 엔진 수입냥!
import { useToolManager, simulateToolAction, toLLM } from "@ink/assembler";

// 🛡️ [Type Zone]: 동적 폼 스키마 제어를 위한 전용 규격 정의냥!
interface ToolParameterSchema {
  type: string;
  description?: string;
}

interface ToolRegistryItem {
  name: string;
  description: string;
  parameters: {
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

export function ToolTester() {
  // 🚀 1. 통합 툴 매니저 훅을 통한 가용 툴 구독 (0ms IndexedDB + Firestore 싱크)
  const { activeTools } = useToolManager();

  // 🚀 2. StoredTool 배열을 LLM / UI 실행용 스키마 명세 형태로 자동 메모이제이션 변환
  const tools = useMemo<ToolRegistryItem[]>(() => {
    if (!activeTools || activeTools.length === 0) return [];
    return toLLM(activeTools) as unknown as ToolRegistryItem[];
  }, [activeTools]);

  const [selectedTool, setSelectedTool] = useState<ToolRegistryItem | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [rawJsonMode, setRawJsonMode] = useState(false);
  const [rawJsonString, setRawJsonString] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const handleSelectTool = (toolName: string) => {
    const tool = tools.find((t) => t.name === toolName);
    setSelectedTool(tool || null);
    setResult(null);
    setRawJsonMode(false);

    const initialData: Record<string, string> = {};
    const props = tool?.parameters?.properties || {};

    Object.keys(props).forEach((key) => {
      initialData[key] = "";
    });
    setFormData(initialData);
    setRawJsonString(JSON.stringify(initialData, null, 2));
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setLoading(true);
    setResult(null);

    let cleanPayload: Record<string, unknown> = {};

    try {
      if (rawJsonMode) {
        cleanPayload = JSON.parse(rawJsonString) as Record<string, unknown>;
      } else {
        cleanPayload = Object.fromEntries(
          Object.entries(formData).filter(([, v]) => v !== "" && v !== undefined)
        );

        for (const key in cleanPayload) {
          const value = cleanPayload[key];
          const type = selectedTool.parameters.properties[key]?.type;
          if (type === "number" && typeof value === "string") {
            cleanPayload[key] = Number(value);
          } else if (type === "boolean" && typeof value === "string") {
            cleanPayload[key] = value === "true";
          } else if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
            try {
              cleanPayload[key] = JSON.parse(value);
            } catch (e) {
              console.warn(e);
            }
          }
        }
      }

      // 🚀 3. 선택된 도구 식별자와 일치하는 실물 StoredTool 원본 추출
      const targetTool = activeTools.find(
        (t) =>
          t.name === selectedTool.name ||
          t.id === selectedTool.name ||
          t.id.replace(/[^a-zA-Z0-9_-]/g, "_") === selectedTool.name
      );

      if (!targetTool) {
        throw new Error(`선택한 도구 '${selectedTool.name}'의 실물 시퀀스 블록을 찾을 수 없습니다냥.`);
      }

      // 🚀 4. Pure Bone 파이프라인 엔진 직접 타격 실행!
      const res = await simulateToolAction(targetTool, cleanPayload);
      setResult(res);
    } catch (err) {
      setResult({ success: false, error: "파이프라인 연산 실행 에러: " + String(err) });
    } finally {
      setLoading(false);
    }
  };

  const renderDynamicForm = () => {
    if (!selectedTool) return <p className="text-sm text-stone-400">도구를 선택해라냥.</p>;

    const props = selectedTool.parameters?.properties || {};
    const requiredProps = selectedTool.parameters?.required || [];

    return (
      <div className="space-y-4">
        {Object.entries(props).map(([key, propSchema]: [string, ToolParameterSchema]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-wider flex justify-between">
              <span>
                {key}
                {requiredProps.includes(key) && <span className="text-red-500 ml-1">*</span>}
              </span>
              <span className="font-mono text-[9px] lowercase opacity-50">{propSchema.type}</span>
            </label>
            <input
              type="text"
              value={typeof formData[key] === "object" ? JSON.stringify(formData[key]) : formData[key] || ""}
              onChange={(e) => {
                const val = e.target.value;
                const nextFormData = { ...formData, [key]: val };
                setFormData(nextFormData);

                try {
                  const newJson: Record<string, unknown> = {};
                  Object.entries(nextFormData).forEach(([k, v]) => {
                    newJson[k] = v.startsWith("{") || v.startsWith("[") ? JSON.parse(v) : v;
                  });
                  setRawJsonString(JSON.stringify(newJson, null, 2));
                } catch (e) {
                  console.warn(e);
                }
              }}
              placeholder={propSchema.description || `${key} 값 입력... (객체는 JSON 문자열로)`}
              className="border border-stone-200 rounded-lg p-2.5 text-xs font-mono bg-stone-50 focus:outline-none focus:border-stone-500 focus:bg-white transition-colors"
            />
            {propSchema.description && <p className="text-[10px] text-stone-400">{propSchema.description}</p>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col md:flex-row min-h-[550px] max-h-[80vh]">
      {/* 왼쪽: 도구 목록 패널 */}
      <div className="w-full md:w-72 border-r border-stone-200 bg-stone-50/50 flex flex-col h-full">
        <div className="p-4 border-b border-stone-200 shrink-0">
          <h3 className="font-black text-xs text-stone-900 tracking-wider">🛠️ 도구 실험실 (Registry)</h3>
          <p className="text-[10px] text-stone-500 mt-1 leading-tight">동적 스키마 바인딩 패널</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          {tools.map((t) => {
            const props = t.parameters?.properties || {};
            const requiredProps = t.parameters?.required || [];
            const paramKeys = Object.keys(props);

            return (
              <button
                key={t.name}
                onClick={() => handleSelectTool(t.name)}
                className={`w-full text-left p-3 rounded-xl transition-all border cursor-pointer ${
                  selectedTool?.name === t.name
                    ? "bg-stone-900 border-stone-900 text-white shadow-md"
                    : "bg-white border-stone-200 text-stone-600 hover:bg-stone-100 hover:border-stone-300"
                }`}
              >
                <div className="font-mono text-xs font-bold mb-1">{t.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {paramKeys.length === 0 ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-400 font-mono">
                      No args
                    </span>
                  ) : (
                    paramKeys.map((k) => (
                      <span
                        key={k}
                        className={`text-[8.5px] px-1.5 py-0.5 rounded border font-mono tracking-tight ${
                          requiredProps.includes(k)
                            ? selectedTool?.name === t.name
                              ? "border-stone-600 text-stone-300 bg-stone-800"
                              : "border-rose-200 text-rose-600 bg-rose-50"
                            : selectedTool?.name === t.name
                              ? "border-stone-700 text-stone-400"
                              : "border-stone-200 text-stone-500 bg-stone-50"
                        }`}
                      >
                        {k}
                        {requiredProps.includes(k) && "*"}
                      </span>
                    ))
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 오른쪽: 조작 및 결과 패널 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-5 border-b border-stone-100 bg-white shrink-0">
          <div className="flex justify-between items-start">
            <h4 className="font-bold text-sm text-stone-900 flex items-center gap-2">
              <span className="text-xl">⚙️</span> {selectedTool ? selectedTool.name : "Ready"}
            </h4>

            {selectedTool && (
              <div className="flex bg-stone-100 rounded-lg p-0.5 shadow-inner border border-stone-200/60">
                <button
                  onClick={() => setRawJsonMode(false)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                    !rawJsonMode ? "bg-white text-stone-900 shadow-sm" : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  UI Form
                </button>
                <button
                  onClick={() => setRawJsonMode(true)}
                  className={`px-3 py-1 text-[10px] font-bold font-mono rounded-md transition-all cursor-pointer ${
                    rawJsonMode ? "bg-stone-900 text-white shadow-sm" : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  Raw JSON
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-stone-500 mt-2.5 leading-relaxed bg-stone-50 p-2.5 rounded-lg border border-stone-100 shadow-5xs">
            {selectedTool ? selectedTool.description : "왼쪽에서 실험할 도구를 선택하고 파라미터를 주입해보라냥."}
          </p>
        </div>

        <div className="flex-1 p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
          <div className="flex flex-col h-full overflow-hidden">
            <h5 className="font-bold text-[10px] uppercase tracking-widest text-stone-400 mb-3 border-b border-stone-100 pb-2 shrink-0">
              Payload Injector {rawJsonMode ? "(JSON)" : "(Form)"}
            </h5>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {!rawJsonMode ? (
                renderDynamicForm()
              ) : (
                <textarea
                  value={rawJsonString}
                  onChange={(e) => setRawJsonString(e.target.value)}
                  placeholder="{\n  // JSON 형식으로 파라미터를 직접 작성해라냥\n}"
                  className="w-full h-full min-h-[250px] border border-stone-200 rounded-xl p-3 text-[11px] font-mono bg-stone-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-stone-500 resize-none custom-scrollbar"
                />
              )}
            </div>

            {selectedTool && (
              <button
                onClick={handleExecute}
                disabled={loading}
                className="mt-4 w-full bg-stone-900 text-white font-bold p-3 rounded-xl text-xs hover:bg-stone-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-sm"
              >
                {loading ? "⏳ 궤도 진입 중..." : "⚡ 단독 실행 (Force Execute)"}
              </button>
            )}
          </div>

          <div className="flex flex-col bg-stone-900 rounded-2xl p-4 shadow-inner overflow-hidden border border-stone-800 h-full">
            <h5 className="font-bold text-[10px] uppercase tracking-widest text-stone-400 mb-3 border-b border-stone-700 pb-2 flex justify-between shrink-0">
              <span>Response Console</span>
              <span className={result ? "text-emerald-400" : "text-stone-500"}>
                {result ? "200 OK" : "IDLE"}
              </span>
            </h5>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              <pre className="text-[10px] font-mono text-stone-300 whitespace-pre-wrap leading-relaxed">
                {result
                  ? JSON.stringify(result, null, 2)
                  : "// 실행 결과가 여기에 출력된다냥...\n// 왼쪽 버튼을 눌러 Force Execute를 가동해라냥."}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
