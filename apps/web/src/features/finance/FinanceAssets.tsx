"use client";

import { useState } from "react";
import {
  deleteFinanceAssetAction,
  saveFinanceAssetAction,
  saveFinancePreferencesAction,
} from "@ink/assembler";
import type { FinanceAsset, FinanceBook } from "@ink/engine";

interface FinanceAssetsProps {
  book: FinanceBook;
  onBookChange: (book: FinanceBook) => Promise<void>;
  onReload: () => Promise<void>;
}

export function FinanceAssets({ book, onBookChange, onReload }: FinanceAssetsProps) {
  const [form, setForm] = useState({
    name: "",
    category: book.assetCategories[0] || "현금",
    balance: "",
    note: "",
  });
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const total = book.assets.reduce((sum, asset) => sum + asset.balance, 0);

  const addCategory = async () => {
    const value = newCategory.trim();
    if (!value) return;
    const preferences = {
      categories: book.categories,
      assetCategories: [...new Set([...book.assetCategories, value])],
    };
    await saveFinancePreferencesAction(preferences);
    await onBookChange({ ...book, ...preferences });
    setForm({ ...form, category: value });
    setNewCategory("");
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const current = book.assets.find((asset) => asset.id === editingId);
    const asset: FinanceAsset = {
      id: current?.id || `asset_${crypto.randomUUID()}`,
      name: form.name.trim(),
      category: form.category,
      balance: Number(form.balance),
      note: form.note.trim(),
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    try {
      const resetBalance = !current || Number(form.balance) !== current.balance;
      await saveFinanceAssetAction(asset, resetBalance);
      await onReload();
      setForm({ ...form, name: "", balance: "", note: "" });
      setEditingId(null);
      setMessage(
        current
          ? resetBalance
            ? "자산 정보와 기준 잔액을 수정했습니다."
            : "자산 정보를 수정했습니다."
          : "자산을 등록했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 자산을 삭제할까요? 거래 내역은 유지됩니다.")) return;
    await deleteFinanceAssetAction(id);
    await onBookChange({ ...book, assets: book.assets.filter((asset) => asset.id !== id) });
  };

  const edit = (asset: FinanceAsset) => {
    setEditingId(asset.id);
    setForm({
      name: asset.name,
      category: asset.category,
      balance: String(asset.balance),
      note: asset.note,
    });
    setMessage("잔액을 변경한 경우에만 오늘 기준 잔액으로 다시 설정합니다.");
  };

  return (
    <div className="space-y-5 rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="rounded-3xl bg-emerald-950 p-6 text-white">
        <p className="text-xs font-bold tracking-[0.15em] text-white/50">TOTAL ASSETS</p>
        <p className="mt-2 text-3xl font-black">₩{total.toLocaleString()}</p>
      </div>

      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
        <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="자산 이름 (예: 생활비 통장)" className="finance-input" />
        <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="finance-input">
          {book.assetCategories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <input type="number" required value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} placeholder="현재 잔액" className="finance-input" />
        <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="메모" className="finance-input" />
        <div className="flex gap-2 sm:col-span-2">
          <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="새 자산 분류" className="finance-input min-w-0 flex-1" />
          <button type="button" onClick={() => void addCategory()} className="rounded-xl bg-stone-100 px-4 text-xs font-bold">분류 추가</button>
          {editingId && (
            <button type="button" onClick={() => {
              setEditingId(null);
              setForm({ ...form, name: "", balance: "", note: "" });
            }} className="rounded-xl px-4 text-xs font-bold text-stone-500">취소</button>
          )}
          <button type="submit" disabled={saving} className="rounded-xl bg-stone-950 px-5 py-3 text-sm font-bold text-white disabled:bg-stone-300">
            {saving ? "저장 중" : editingId ? "자산 수정" : "자산 등록"}
          </button>
        </div>
      </form>
      <p className="text-xs text-stone-400">
        등록 자산과 이름이 같은 거래는 수입은 더하고 지출은 빼서 현재 잔액에 자동 반영합니다.
      </p>
      {message && <p role="status" className="text-xs font-bold text-emerald-700">{message}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {book.assets.length === 0 ? (
          <p className="sm:col-span-2 rounded-2xl bg-stone-50 p-8 text-center text-sm text-stone-400">등록된 자산이 없습니다.</p>
        ) : book.assets.map((asset) => (
          <article key={asset.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-emerald-700">{asset.category}</span>
                <h3 className="mt-1 font-black text-stone-800">{asset.name}</h3>
              </div>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => edit(asset)} className="text-stone-500 hover:text-stone-900">수정</button>
                <button type="button" onClick={() => void remove(asset.id)} className="text-stone-400 hover:text-rose-600">삭제</button>
              </div>
            </div>
            <p className="mt-4 text-xl font-black">₩{asset.balance.toLocaleString()}</p>
            {asset.note && <p className="mt-1 text-xs text-stone-400">{asset.note}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
