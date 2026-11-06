"use client";

import { useEffect, useState } from "react";
import {
  isSystemToolAdminAction,
  listSystemToolsAction,
  replaceSystemToolsAction,
  resetSystemToolsAction,
  type StoredTool,
} from "@ink/assembler";

export default function AdminToolConsolePage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tools, setTools] = useState<StoredTool[]>([]);
  const [json, setJson] = useState("[]");
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([isSystemToolAdminAction(), listSystemToolsAction()])
      .then(([admin, currentTools]) => {
        setIsAdmin(admin);
        if (admin) {
          setTools(currentTools);
          setJson(JSON.stringify(currentTools, null, 2));
        }
      })
      .catch(() => setIsAdmin(false));
  }, []);

  const apply = async () => {
    try {
      const saved = await replaceSystemToolsAction(JSON.parse(json));
      setTools(saved);
      setJson(JSON.stringify(saved, null, 2));
      setMessage(`${saved.length}개 시스템 툴을 교체했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const reset = async () => {
    try {
      const saved = await resetSystemToolsAction();
      setTools(saved);
      setJson(JSON.stringify(saved, null, 2));
      setMessage(`${saved.length}개 안전한 기본 툴을 등록했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  if (isAdmin === null) return <main className="p-8">권한 확인 중...</main>;
  if (!isAdmin) return <main className="p-8">접근 권한이 없습니다.</main>;

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black">시스템 툴 관리</h1>
        <p className="mt-1 text-sm text-stone-500">
          Firebase의 system/tools 문서를 통째로 교체합니다. CODE 블록은 등록되지 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={reset} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white">
          안전한 기본 툴로 초기화
        </button>
        <button onClick={apply} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
          아래 JSON으로 전체 교체
        </button>
      </div>

      {message && <p className="rounded-xl bg-stone-100 p-3 text-sm">{message}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        {tools.map((tool) => (
          <div key={tool.id} className="rounded-xl border border-stone-200 bg-white p-3">
            <strong>{tool.name}</strong>
            <p className="font-mono text-xs text-stone-400">{tool.id}</p>
          </div>
        ))}
      </div>

      <textarea
        value={json}
        onChange={(event) => setJson(event.target.value)}
        className="min-h-[480px] w-full rounded-xl border border-stone-300 p-4 font-mono text-xs"
        spellCheck={false}
      />
    </main>
  );
}
