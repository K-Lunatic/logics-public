import assert from "node:assert/strict";
import test from "node:test";
import { isMutationToolName } from "../../../ai/src/adaptive.ts";
import { mealFeedbackSchema, recipeReferenceSchema } from "../../../engine/src/schemas/life.ts";
import { getDefaultSystemTools } from "./systemToolCatalog.ts";
import { fallbackRecipeReferences } from "../lib/mealReferenceFallback.ts";
import { localRecipeMarkdown } from "../lib/mealRecipeMarkdown.ts";

test("식단·재무·건강 시스템 툴은 읽기와 쓰기를 구분해 등록한다", () => {
  const ids = new Set(getDefaultSystemTools().map((tool) => tool.id));
  [
    "sys-meal-list",
    "sys-meal-nutrition-estimate",
    "sys-meal-plan-add-generated",
    "sys-meal-recipe-search",
    "sys-meal-reference-set",
    "sys-meal-feedback-set",
    "sys-finance-summary",
    "sys-health-profile-get",
    "sys-health-measurement-add",
    "sys-health-care-update-status",
  ].forEach((id) => assert.equal(ids.has(id), true, `${id} 누락`));
  assert.equal(isMutationToolName("sys-meal-plan-add-generated"), true);
  assert.equal(isMutationToolName("sys-meal-recipe-search"), false);
  assert.equal(isMutationToolName("sys-meal-reference-set"), true);
  assert.equal(isMutationToolName("sys-meal-feedback-set"), true);
  assert.equal(isMutationToolName("sys-health-measurement-add"), true);
  assert.equal(isMutationToolName("sys-finance-summary"), false);
});

test("외부 레시피와 식단 피드백 입력 경계를 검증한다", () => {
  assert.equal(recipeReferenceSchema.safeParse({
    title: "김치찌개",
    url: "https://www.10000recipe.com/recipe/1",
    sourceType: "WEB",
    verifiedAt: new Date().toISOString(),
  }).success, true);
  assert.equal(mealFeedbackSchema.safeParse({
    id: "feedback_meal_1",
    mealId: "meal_1",
    mealTitle: "김치찌개",
    rating: 6,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).success, false);
});

test("Gemini 할당량이 없어도 안전한 레시피 검색 링크를 만든다", () => {
  const references = fallbackRecipeReferences("김치찌개");
  assert.equal(references.length, 3);
  assert.equal(references.every((reference) => reference.url.startsWith("https://")), true);
  assert.equal(references.some((reference) => reference.sourceType === "YOUTUBE"), true);
});

test("AI를 쓸 수 없어도 레시피를 표와 순서가 있는 Markdown으로 정리한다", () => {
  const markdown = localRecipeMarkdown({
    title: "계란볶음밥",
    ingredients: ["밥 1공기", "계란 2개"],
    recipe: "계란을 볶는다.\n밥을 넣는다.",
  });
  assert.match(markdown, /\| 재료 \| 분량 \|/);
  assert.match(markdown, /1\. 계란을 볶는다/);
});
