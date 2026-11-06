"use client";

import { useState } from "react";
import { generateRescueRecipeAction } from "@ink/assembler";
import { Button, Card } from "@/components/ui";

type Recipe = Extract<
  Awaited<ReturnType<typeof generateRescueRecipeAction>>,
  { success: true }
>["data"];

export function RescueChefCard() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await generateRescueRecipeAction();
      if (!result.success) {
        setRecipe(null);
        setMessage(result.error);
        return;
      }
      setRecipe(result.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="🥗 임박 식재료 구조대">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs leading-relaxed text-stone-500">
          3일 안에 소비해야 할 식품으로 15분 자취 요리를 만듭니다.
        </p>
        <Button type="button" size="sm" onClick={generate} disabled={loading}>
          {loading ? "요리 구상 중..." : "레시피 만들기"}
        </Button>
      </div>

      {message && <p className="mt-4 text-sm text-stone-500">{message}</p>}
      {recipe && (
        <div className="mt-5 space-y-4 border-t border-stone-100 pt-4">
          <div>
            <h4 className="font-black text-stone-900">{recipe.title}</h4>
            <p className="mt-1 text-xs text-stone-500">
              약 {recipe.minutes}분 · {recipe.reason}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {recipe.ingredients.map((ingredient) => (
              <span
                key={`${ingredient.name}-${ingredient.amount}`}
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
              >
                {ingredient.name} {ingredient.amount}
              </span>
            ))}
          </div>
          <ol className="space-y-2 text-sm text-stone-600">
            {recipe.steps.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="font-black text-emerald-600">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
