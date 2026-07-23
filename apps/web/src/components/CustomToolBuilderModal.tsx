// 📂 apps/web/src/components/CustomToolBuilderModal.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";

// 🚀 [Pure Bone] 레거시 simulateDraftToolAction 대신 표준 runPipeline 연산 커널 수입냥!
import {
  runPipeline,
  StoredTool,
  PipelineBlock,
  BlockType,
  DataType,
  OutputMappingDef,
} from "@ink/assembler";

interface ToolBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterTool: (tool: StoredTool) => void;
  storedTools?: StoredTool[];
}

export function CustomToolBuilderModal({
  isOpen,
  onClose,
  onRegisterTool,
  storedTools = [],
}: ToolBuilderProps) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string })?.id || "";

  // 🚀 1. LIST 탭 추가 및 수정 모드 식별자(editingToolId) 상태
  const [activeTab, setActiveTab] = useState<"LIST" | "BUILDER" | "SIMULATOR">(
    "LIST",
  );
  const [editingToolId, setEditingToolId] = useState<string | null>(null);

  const [toolName, setToolName] = useState("");
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<PipelineBlock[]>([]);

  const [simInputs, setSimInputs] = useState<Record<string, string>>({});
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [simFinalResult, setSimFinalResult] = useState<unknown>(null);
  const [isRunningSim, setIsRunningSim] = useState(false);

  // 🚀 [교정 1]: ESLint 폭포수 렌더링 경고 해결 (Promise.resolve().then 마이크로태스크 비동기 처리)
  useEffect(() => {
    const inputBlock = blocks.find((b) => b.type === "INPUT");
    const params = inputBlock?.inputParams || [];

    Promise.resolve().then(() => {
      setSimInputs((prev) => {
        const nextForm: Record<string, string> = {};
        params.forEach((p) => {
          nextForm[p.key] =
            prev[p.key] !== undefined ? prev[p.key] : p.defaultValue || "";
        });
        return nextForm;
      });
    });
  }, [blocks]);

  const availableVarPaths = useMemo<string[]>(() => {
    const paths: string[] = [];
    blocks.forEach((b) => {
      if (b.type === "INPUT") {
        (b.inputParams || []).forEach((p) => paths.push(`inputs.${p.key}`));
      } else if (b.type === "OPERATION" && b.toolId) {
        const targetTool = storedTools.find((t) => t.id === b.toolId);
        const outputBlock = targetTool?.blocks.find(
          (block) => block.type === "OUTPUT",
        );
        if (outputBlock?.outputMapping) {
          outputBlock.outputMapping.forEach((m) =>
            paths.push(`steps.${b.id}.${m.returnKey}`),
          );
        }
      } else if (b.type === "CODE") {
        paths.push(`steps.${b.id}.result`);
      }
    });
    return Array.from(new Set(paths)); // Set으로 중복 변수 경로 정화
  }, [blocks, storedTools]);

  // --- [액션 핸들러] ---
  const handleCreateNew = () => {
    setEditingToolId(null);
    setToolName("");
    setBlocks([]);
    setActiveTab("BUILDER");
  };

  const handleEditTool = (tool: StoredTool) => {
    setEditingToolId(tool.id);
    setToolName(tool.name);
    setBlocks(tool.blocks);
    setActiveTab("BUILDER");
  };

  const moveBlock = (index: number, direction: "UP" | "DOWN") => {
    const targetIndex = direction === "UP" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const newBlocks = [...blocks];
    const [movedBlock] = newBlocks.splice(index, 1);
    newBlocks.splice(targetIndex, 0, movedBlock);
    setBlocks(newBlocks);
  };

  const removeBlock = (id: string) =>
    setBlocks(blocks.filter((b) => b.id !== id));

  // 🚀 [교정 3]: 블록 고유 난수 ID 부여로 Key 충돌 차단
  const addBlock = (type: BlockType) => {
    setBlocks([
      ...blocks,
      {
        id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type,
        title: `${type} 절차 지시 장부`,
        inputParams: [],
        toolId: "",
        toolArgs: {},
        customCode: "return {\n  \n};",
        outputMapping: [],
      },
    ]);
  };

  const updateBlock = (id: string, updates: Partial<PipelineBlock>) => {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const handleSaveTool = () => {
    if (!toolName.trim())
      return alert("생성할 파이프라인 도구의 고유 명칭을 입력해라냥! 🐾");
    if (blocks.length === 0)
      return alert("최소 한 개 이상의 시퀀스 블록을 결합해야 합니다냥!");

    const targetId =
      editingToolId ||
      `tool-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    onRegisterTool({
      id: targetId,
      name: toolName.trim(),
      scope: "user",
      userId: currentUserId,
      blocks,
      createdAt: new Date().toISOString(),
      status: "ACTIVE",
    });

    setToolName("");
    setBlocks([]);
    setEditingToolId(null);
    setActiveTab("LIST");
  };

  const runSimulation = async () => {
    if (!currentUserId) {
      alert(
        "🚨 로그인 세션이 확인되지 않았다냥! 로그인 후 본인 계정 데이터로 시뮬레이션해라냥! 🐾",
      );
      return;
    }
    if (blocks.length === 0) {
      alert("시뮬레이션할 파이프라인 블록이 존재하지 않습니다냥!");
      return;
    }

    setIsRunningSim(true);
    setSimLogs([
      `🚀 [User Context Test] 유저 UID(${currentUserId.substring(0, 8)}...) 실물 DB 바인딩 세션 진입...`,
      `📦 작성 중인 파이프라인 시퀀스를 백엔드 연산 커널로 직통 전송 중...`,
    ]);

    try {
      const draftTool: StoredTool = {
        id: `draft-sim-${Date.now()}`,
        name: toolName.trim() || "DraftTestTool",
        scope: "user",
        userId: currentUserId,
        createdAt: new Date().toISOString(),
        status: "ACTIVE",
        blocks: blocks,
      };

      // 🚀 [수술 포인트]: runPipeline 엔진으로 직접 시뮬레이션 수행!
      const simRes = await runPipeline(
        currentUserId,
        draftTool,
        simInputs,
      );

      if (simRes.success) {
        setSimLogs((prev) => [
          ...prev,
          "✅ [백엔드 연산 완수] 유저 실물 DB(스케줄/인벤토리) Context 바인딩 연산 마감!",
          `🎉 반환 데이터 스냅샷: ${JSON.stringify(simRes.result)}`,
        ]);
        setSimFinalResult(simRes.result);
      } else {
        throw new Error(
          simRes.error || "시뮬레이션 실행 중 실패가 발생했습니다.",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSimLogs((prev) => [...prev, `🚨 [런타임 에러 포착]: ${msg}`]);
      setSimFinalResult({ status: "error", message: msg });
    } finally {
      setIsRunningSim(false);
    }
  };

  const handleFetchApiSchema = (blockId: string, targetStepId: string) => {
    if (!targetStepId)
      return alert("연동할 상위 연산 STEP을 먼저 지정해주세요냥!");
    const targetOpBlock = blocks.find((b) => b.id === targetStepId);
    if (!targetOpBlock || targetOpBlock.type !== "OPERATION")
      return alert("올바른 연산 블록이 아닙니다.");

    setIsSyncing(blockId);

    setTimeout(() => {
      const targetTool = storedTools.find((t) => t.id === targetOpBlock.toolId);
      const targetOutputBlock = targetTool?.blocks.find(
        (b) => b.type === "OUTPUT",
      );

      if (
        targetOutputBlock?.outputMapping &&
        targetOutputBlock.outputMapping.length > 0
      ) {
        const newMappings: OutputMappingDef[] =
          targetOutputBlock.outputMapping.map((m, idx) => ({
            id: `om-auto-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
            returnKey: m.returnKey,
            sourceExpr: `{{steps.${targetStepId}.${m.returnKey}}}`,
          }));
        updateBlock(blockId, { outputMapping: newMappings });
      } else {
        updateBlock(blockId, {
          outputMapping: [
            {
              id: `om-fallback-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              returnKey: "status",
              sourceExpr: `{{steps.${targetStepId}.status}}`,
            },
          ],
        });
      }
      setIsSyncing(null);
    }, 150);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/70 backdrop-blur-xs sm:p-4 animate-in fade-in duration-200">
      <div className="w-full h-full sm:h-[94dvh] sm:max-w-4xl bg-stone-100 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-stone-200 transition-all">
        {/* 상단 탭 헤더 제어 바 */}
        <div className="px-5 py-3.5 bg-white border-b border-stone-200 flex justify-between items-center shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-800 bg-stone-50 hover:bg-stone-200 rounded-full font-bold text-xs transition-colors cursor-pointer"
            >
              ✕
            </button>
            {activeTab !== "LIST" ? (
              <input
                type="text"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="새로운 파이프라인 도구 식별명 기입..."
                className="font-black text-stone-900 text-sm bg-transparent outline-none border-b border-dashed border-stone-300 focus:border-stone-800 w-64"
              />
            ) : (
              <span className="font-black text-stone-900 text-sm">
                파이프라인 툴 저장소
              </span>
            )}
          </div>

          <div className="flex bg-stone-100 p-1 rounded-xl text-xs font-bold gap-1 border border-stone-200/60">
            <button
              type="button"
              onClick={() => setActiveTab("LIST")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === "LIST"
                  ? "bg-white shadow-sm text-stone-900"
                  : "text-stone-400 hover:text-stone-700"
              }`}
            >
              📑 도구 목록
            </button>
            <button
              type="button"
              onClick={() => {
                if (!editingToolId && blocks.length === 0) handleCreateNew();
                else setActiveTab("BUILDER");
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === "BUILDER"
                  ? "bg-white shadow-sm text-stone-900"
                  : "text-stone-400 hover:text-stone-700"
              }`}
            >
              🧩 {editingToolId ? "에디터 (수정 중)" : "에디터"}
            </button>
            <button
              type="button"
              disabled={activeTab === "LIST"}
              onClick={() => {
                setActiveTab("SIMULATOR");
                runSimulation();
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50 ${
                activeTab === "SIMULATOR"
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-400 hover:text-stone-700"
              }`}
            >
              🧪 테스트
            </button>
          </div>
        </div>

        {/* TAB 0: 📑 파이프라인 도구 목록 (LIST) */}
        {activeTab === "LIST" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-stone-50/50">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
              <div>
                <h3 className="font-black text-stone-800">
                  등록된 파이프라인 툴
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  기존 툴을 클릭하여 시퀀스를 수정하거나 새로운 툴을 조립하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateNew}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                + 새 툴 만들기
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {storedTools.map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => handleEditTool(tool)}
                  className="bg-white border border-stone-200 hover:border-purple-400 hover:shadow-lg transition-all rounded-2xl p-4 cursor-pointer group flex flex-col"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        tool.scope === "system"
                          ? "bg-stone-800 text-white"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {tool.scope.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {tool.blocks.length} BLOCKS
                    </span>
                  </div>
                  <h4 className="font-black text-stone-900 text-sm group-hover:text-purple-600 transition-colors">
                    {tool.name}
                  </h4>
                  <p className="text-xs text-stone-500 font-mono mt-1 truncate">
                    {tool.id}
                  </p>
                </div>
              ))}
              {storedTools.length === 0 && (
                <div className="col-span-full py-12 text-center text-stone-400 text-sm font-bold">
                  등록된 툴이 없습니다냥. 새 툴을 만들어보라냥!
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: 🧩 순수 빌더 에디터 대시보드 (BUILDER) */}
        {activeTab === "BUILDER" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-stone-50/50">
            {/* 상단 변수 도우미 */}
            <div className="p-3 bg-stone-900 text-white rounded-2xl flex items-center gap-3 overflow-x-auto text-[11px] shrink-0 shadow-md">
              <span className="font-bold text-amber-400 shrink-0">
                📋 가용 변수 경로 (클릭 복사):
              </span>
              <div className="flex gap-1.5 overflow-x-auto pr-2">
                {availableVarPaths.length === 0 ? (
                  <span className="text-stone-500 italic">
                    감지된 변수가 없습니다냥
                  </span>
                ) : (
                  availableVarPaths.map((path) => (
                    <span
                      key={path}
                      onClick={() => {
                        navigator.clipboard.writeText(`{{${path}}}`);
                        alert(`'{{${path}}}' 복사 완료!`);
                      }}
                      className="bg-stone-800 border border-stone-700 hover:border-amber-400 px-2 py-0.5 rounded-md font-mono text-stone-300 cursor-pointer transition-all shrink-0"
                    >
                      {"{{" + path + "}}"}
                    </span>
                  ))
                )}
              </div>
            </div>

            {blocks.length === 0 ? (
              <div className="h-[350px] flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-stone-200 rounded-3xl p-8">
                <span className="text-3xl mb-2">🐾</span>
                <p className="text-sm font-black text-stone-700">
                  시퀀스 파이프라인이 비어있다냥!
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  하단 단추를 눌러 INPUT, 연산, CODE, OUTPUT 블록을 커스텀
                  조립해라냥.
                </p>
              </div>
            ) : (
              blocks.map((block, index) => {
                const previousOpBlocks = blocks
                  .slice(0, index)
                  .filter((b) => b.type === "OPERATION");

                return (
                  <div
                    key={block.id}
                    className="flex flex-col items-center w-full"
                  >
                    {index > 0 && (
                      <div className="my-1 flex flex-col items-center">
                        <div className="w-0.5 h-4 bg-stone-300" />
                        <div className="text-[9px] text-stone-500 font-mono font-black bg-stone-200/70 px-2 py-0.5 rounded-md">
                          ▼ FLOW SEQ STEP {index + 1}
                        </div>
                      </div>
                    )}

                    <div
                      className={`w-full bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${
                        block.type === "INPUT"
                          ? "border-purple-500/80"
                          : block.type === "OPERATION"
                            ? "border-emerald-500/80"
                            : block.type === "CODE"
                              ? "border-indigo-500/80"
                              : "border-rose-500/80"
                      }`}
                    >
                      <div
                        className={`px-4 py-2.5 flex items-center justify-between text-white ${
                          block.type === "INPUT"
                            ? "bg-purple-600"
                            : block.type === "OPERATION"
                              ? "bg-emerald-600"
                              : block.type === "CODE"
                                ? "bg-indigo-600"
                                : "bg-rose-600"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-mono font-black tracking-widest">
                            {block.type}
                          </span>
                          <input
                            type="text"
                            value={block.title}
                            onChange={(e) =>
                              updateBlock(block.id, { title: e.target.value })
                            }
                            className="font-extrabold text-xs bg-transparent outline-none placeholder-white/70 w-64"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveBlock(index, "UP")}
                            className="p-1 hover:bg-black/20 rounded disabled:opacity-30 text-xs cursor-pointer"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={index === blocks.length - 1}
                            onClick={() => moveBlock(index, "DOWN")}
                            className="p-1 hover:bg-black/20 rounded disabled:opacity-30 text-xs cursor-pointer"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBlock(block.id)}
                            className="p-1 hover:bg-black/20 rounded text-xs ml-1 font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="p-4 space-y-3.5 bg-white text-xs">
                        {block.type === "INPUT" && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-mono font-black text-purple-900 border-b border-purple-50 pb-1.5">
                              <span>
                                인수 입력 명세 정의 (INTERFACE INPUT SPEC)
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateBlock(block.id, {
                                    inputParams: [
                                      ...(block.inputParams || []),
                                      {
                                        id: `ip-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                        key: "paramKey",
                                        type: "string",
                                        required: true,
                                        description: "",
                                      },
                                    ],
                                  })
                                }
                                className="text-purple-600 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-xl font-bold transition-all cursor-pointer"
                              >
                                + 인수 변수 추가
                              </button>
                            </div>
                            {(block.inputParams || []).map((p) => (
                              <div
                                key={p.id}
                                className="p-3 bg-stone-50/70 rounded-2xl border border-stone-200/60 space-y-2"
                              >
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={p.key}
                                    onChange={(e) =>
                                      updateBlock(block.id, {
                                        inputParams: block.inputParams?.map(
                                          (item) =>
                                            item.id === p.id
                                              ? { ...item, key: e.target.value }
                                              : item,
                                        ),
                                      })
                                    }
                                    placeholder="식별 변수명 (key)"
                                    className="font-mono text-xs p-1.5 border border-stone-200 rounded-xl w-1/3 bg-white outline-none"
                                  />
                                  <select
                                    value={p.type}
                                    onChange={(e) =>
                                      updateBlock(block.id, {
                                        inputParams: block.inputParams?.map(
                                          (item) =>
                                            item.id === p.id
                                              ? {
                                                  ...item,
                                                  type: e.target
                                                    .value as unknown as DataType,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                    className="p-1.5 border border-stone-200 rounded-xl font-mono text-xs bg-white outline-none text-purple-700 font-bold"
                                  >
                                    <option value="string">string</option>
                                    <option value="number">number</option>
                                    <option value="boolean">boolean</option>
                                    <option value="json">json</option>
                                    <option value="file">
                                      file (업로드/URL)
                                    </option>
                                  </select>
                                  <label className="flex items-center gap-1.5 cursor-pointer ml-auto bg-white border border-purple-100 px-2 py-1 rounded-xl shadow-2xs">
                                    <input
                                      type="checkbox"
                                      checked={p.required}
                                      onChange={(e) =>
                                        updateBlock(block.id, {
                                          inputParams: block.inputParams?.map(
                                            (item) =>
                                              item.id === p.id
                                                ? {
                                                    ...item,
                                                    required: e.target.checked,
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                      className="rounded text-purple-600"
                                    />
                                    <span className="text-[10px] font-black text-purple-950">
                                      필수
                                    </span>
                                  </label>
                                </div>
                                <input
                                  type="text"
                                  value={p.description || ""}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      inputParams: block.inputParams?.map(
                                        (item) =>
                                          item.id === p.id
                                            ? {
                                                ...item,
                                                description: e.target.value,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                  placeholder="에이전트 판단 가이드 또는 파일 형식 설명..."
                                  className="w-full text-[11px] p-2 border border-stone-200 rounded-xl bg-white outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {block.type === "OPERATION" && (
                          <div className="space-y-3.5">
                            <div>
                              <label className="block text-[10px] text-stone-400 font-mono font-black mb-1">
                                라이브 실물 도구 매핑
                              </label>
                              <select
                                value={block.toolId || ""}
                                onChange={(e) =>
                                  updateBlock(block.id, {
                                    toolId: e.target.value,
                                    toolArgs: {},
                                  })
                                }
                                className="w-full p-2.5 border border-emerald-200 rounded-xl bg-stone-50/50 font-extrabold text-xs outline-none"
                              >
                                <option value="">-- 적재 도구 선택 --</option>
                                {storedTools.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    📂 {t.name} ({t.id})
                                  </option>
                                ))}
                              </select>
                            </div>
                            {(() => {
                              const targetMeta = storedTools.find(
                                (t) => t.id === block.toolId,
                              );
                              const inputBlockDef = targetMeta?.blocks.find(
                                (b) => b.type === "INPUT",
                              );
                              if (
                                !inputBlockDef?.inputParams ||
                                inputBlockDef.inputParams.length === 0
                              )
                                return null;

                              return (
                                <div className="bg-emerald-50/40 p-3 rounded-2xl border border-emerald-200/70 space-y-2.5">
                                  <span className="block text-[10px] font-mono font-black text-emerald-900 border-b border-emerald-100 pb-1">
                                    ⚙️ 동적 인수 주입 (ARGUMENTS MATCH)
                                  </span>
                                  {inputBlockDef.inputParams.map((param) => (
                                    <div
                                      key={param.id || param.key}
                                      className="space-y-1"
                                    >
                                      <label className="block text-[10px] font-bold text-stone-600">
                                        {param.key} ({param.type}){" "}
                                        {param.required && (
                                          <span className="text-red-500">
                                            *
                                          </span>
                                        )}
                                      </label>
                                      <input
                                        type="text"
                                        value={
                                          block.toolArgs?.[param.key] || ""
                                        }
                                        placeholder="직접 기입 또는 {{inputs.key}} 매핑"
                                        onChange={(e) =>
                                          updateBlock(block.id, {
                                            toolArgs: {
                                              ...(block.toolArgs || {}),
                                              [param.key]: e.target.value,
                                            },
                                          })
                                        }
                                        className="w-full p-2 font-mono text-xs border border-stone-200 rounded-xl bg-white focus:border-emerald-500 outline-none"
                                      />
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {block.type === "CODE" && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-mono font-black text-indigo-950">
                              <span>데이터 가공 스크립트</span>
                              <span className="text-stone-400">
                                인수: (inputs, steps, context)
                              </span>
                            </div>
                            <textarea
                              rows={5}
                              value={block.customCode || ""}
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  customCode: e.target.value,
                                })
                              }
                              className="w-full p-3 font-mono text-[11px] bg-stone-900 text-emerald-400 rounded-2xl outline-none leading-relaxed border border-stone-800"
                            />
                          </div>
                        )}

                        {block.type === "OUTPUT" && (
                          <div className="space-y-3">
                            <div className="flex gap-2 items-end">
                              <div className="flex-1">
                                <label className="block text-[10px] text-stone-400 font-mono font-black mb-1">
                                  연동 대상 상위 STEP 선택
                                </label>
                                <select
                                  value={block.toolId || ""}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      toolId: e.target.value,
                                    })
                                  }
                                  className="w-full p-2 border border-stone-200 rounded-xl bg-white font-bold text-xs outline-none"
                                >
                                  <option value="">
                                    -- 스키마 소스 지정 --
                                  </option>
                                  {previousOpBlocks.map((op) => (
                                    <option key={op.id} value={op.id}>
                                      {op.title} ({op.toolId})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleFetchApiSchema(
                                    block.id,
                                    block.toolId || "",
                                  )
                                }
                                disabled={
                                  !block.toolId || isSyncing === block.id
                                }
                                className="px-3 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 disabled:bg-stone-300 transition-colors shrink-0 cursor-pointer"
                              >
                                {isSyncing === block.id
                                  ? "⏳ 판독 중..."
                                  : "⚡ 구조 일괄 인출"}
                              </button>
                            </div>

                            <div className="flex justify-between items-center text-[10px] font-mono font-black text-rose-950 border-b border-rose-50 pb-1">
                              <span>
                                최종 반환 객체 구조 정의 (RETURN SPEC)
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateBlock(block.id, {
                                    outputMapping: [
                                      ...(block.outputMapping || []),
                                      {
                                        id: `om-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                        returnKey: "key",
                                        sourceExpr: "",
                                      },
                                    ],
                                  })
                                }
                                className="text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-xl font-bold transition-all cursor-pointer"
                              >
                                + 반환 구조 추가
                              </button>
                            </div>
                            {(block.outputMapping || []).map((m) => (
                              <div
                                key={m.id}
                                className="flex gap-2 items-center"
                              >
                                <input
                                  type="text"
                                  value={m.returnKey}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      outputMapping: block.outputMapping?.map(
                                        (item) =>
                                          item.id === m.id
                                            ? {
                                                ...item,
                                                returnKey: e.target.value,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                  placeholder="반환 필드명"
                                  className="w-1/3 p-2 font-mono text-xs border border-stone-200 rounded-xl bg-stone-50 outline-none"
                                />
                                <span className="font-bold text-stone-300">
                                  ←
                                </span>
                                <input
                                  type="text"
                                  value={m.sourceExpr}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      outputMapping: block.outputMapping?.map(
                                        (item) =>
                                          item.id === m.id
                                            ? {
                                                ...item,
                                                sourceExpr: e.target.value,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                  placeholder="예: {{steps['step-id'].key}} 또는 key명"
                                  className="flex-1 p-2 font-mono text-xs border border-stone-200 rounded-xl bg-white outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateBlock(block.id, {
                                      outputMapping:
                                        block.outputMapping?.filter(
                                          (item) => item.id !== m.id,
                                        ),
                                    })
                                  }
                                  className="text-stone-400 hover:text-red-500 font-bold px-1 cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: 🧪 실시간 실물 서버 데이터 연동 시뮬레이터 (SIMULATOR) */}
        {activeTab === "SIMULATOR" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-stone-950 text-stone-200 font-mono text-xs leading-relaxed">
            <div>
              <h4 className="text-[11px] font-black text-purple-400 mb-2 uppercase tracking-wider">
                1. 실물 런타임 테스트 인수 주입 (LIVE MOCK INPUTS)
              </h4>
              <div className="bg-stone-900 p-3.5 rounded-2xl border border-stone-800 space-y-2.5 shadow-md">
                {blocks.find((b) => b.type === "INPUT")?.inputParams?.length ===
                0 ? (
                  <div className="text-stone-600 italic p-2 text-center">
                    INPUT 블록에 파라미터를 추가하면 실시간 입력창이 빌드된다냥!
                  </div>
                ) : (
                  blocks
                    .find((b) => b.type === "INPUT")
                    ?.inputParams?.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-2"
                      >
                        <span className="text-xs text-purple-300 font-bold w-1/3 truncate">
                          {p.key} ({p.type}):
                        </span>
                        {(p.type as string) === "file" ? (
                          <div className="flex-1 flex flex-col gap-1">
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () =>
                                    setSimInputs({
                                      ...simInputs,
                                      [p.key]: reader.result as string,
                                    });
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="text-[10px] file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-900 file:text-purple-300 hover:file:bg-purple-800"
                            />
                            <input
                              type="text"
                              placeholder="또는 파일 외부 공개 URL 직접 입력..."
                              value={
                                simInputs[p.key]?.startsWith("data:")
                                  ? "[로컬 파일 Base64 데이터 삽입됨]"
                                  : simInputs[p.key] || ""
                              }
                              onChange={(e) =>
                                setSimInputs({
                                  ...simInputs,
                                  [p.key]: e.target.value,
                                })
                              }
                              className="bg-stone-950 border border-stone-800 rounded-xl p-2 text-xs text-stone-500 outline-none focus:border-purple-500 font-mono transition-all italic"
                            />
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={simInputs[p.key] || ""}
                            onChange={(e) =>
                              setSimInputs({
                                ...simInputs,
                                [p.key]: e.target.value,
                              })
                            }
                            className="flex-1 bg-stone-950 border border-stone-800 rounded-xl p-2 text-xs text-white outline-none focus:border-purple-500 font-mono transition-all"
                          />
                        )}
                      </div>
                    ))
                )}
              </div>
              <button
                type="button"
                onClick={runSimulation}
                disabled={isRunningSim}
                className="mt-2.5 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-800 font-bold rounded-xl text-white tracking-wide transition-all shadow-lg cursor-pointer text-center"
              >
                {isRunningSim
                  ? "⏳ 백엔드 실물 연산 및 API 타격 중..."
                  : "🚀 실물 백엔드 툴 연산 실행"}
              </button>
            </div>

            <div>
              <h4 className="text-[11px] font-black text-emerald-400 mb-2 uppercase tracking-wider">
                2. 파이프라인 연산 흐름 추적 (LIVE TRACKER CONSOLE)
              </h4>
              <div className="bg-black p-4 rounded-2xl border border-stone-900 h-48 overflow-y-auto text-[11px] font-mono leading-relaxed text-stone-300 shadow-inner">
                {simLogs.map((log, i) => (
                  <div
                    key={`${i}-${log.substring(0, 10)}`}
                    className="whitespace-pre-wrap"
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-black text-rose-400 mb-2 uppercase tracking-wider">
                3. 최종 RETURN 연산 결과 (ACTUAL REAL JSON OUTPUT)
              </h4>
              <pre className="bg-stone-900 p-4 rounded-2xl border border-stone-800 text-xs text-amber-300 overflow-x-auto shadow-md font-mono">
                {JSON.stringify(simFinalResult, null, 2) ||
                  '{\n  "message": "상단 실행 버튼을 누르면 실물 연산 결과가 출력된다냥"\n}'}
              </pre>
            </div>
          </div>
        )}

        {/* 하단 제어 바 (BUILDER 탭에서만 블록 추가 버튼 노출) */}
        {activeTab === "BUILDER" && (
          <div className="p-3 bg-white border-t border-stone-200 flex items-center justify-between shrink-0 shadow-lg">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => addBlock("INPUT")}
                className="px-3 py-2 bg-purple-50 text-purple-900 hover:bg-purple-100 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer"
              >
                📥 INPUT
              </button>
              <button
                type="button"
                onClick={() => addBlock("OPERATION")}
                className="px-3 py-2 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer"
              >
                ⚙️ 연산
              </button>
              <button
                type="button"
                onClick={() => addBlock("CODE")}
                className="px-3 py-2 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer"
              >
                💻 CODE
              </button>
              <button
                type="button"
                onClick={() => addBlock("OUTPUT")}
                className="px-3 py-2 bg-rose-50 text-rose-900 hover:bg-rose-100 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer"
              >
                📤 OUTPUT
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveTool}
              className="bg-stone-900 text-white px-5 py-2.5 text-xs rounded-xl font-black hover:bg-stone-800 transition-colors shadow-md shrink-0 cursor-pointer"
            >
              {editingToolId ? "수정 완료 (덮어쓰기)" : "장립 및 등록 완료"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}