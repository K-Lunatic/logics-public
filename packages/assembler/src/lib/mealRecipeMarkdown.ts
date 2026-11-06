export function localRecipeMarkdown(input: {
  title: string;
  ingredients: string[];
  recipe?: string;
}) {
  const steps = (input.recipe || "")
    .split(/\r?\n|(?<=\.)\s+/)
    .map((value) => value.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  return [
    `# ${input.title}`,
    "",
    "## 재료",
    "",
    "| 재료 | 분량 |",
    "| --- | --- |",
    ...(input.ingredients.length
      ? input.ingredients.map((ingredient) => `| ${ingredient.replaceAll("|", "\\|")} | 확인 필요 |`)
      : ["| 입력된 재료 없음 | 확인 필요 |"]),
    "",
    "## 조리 순서",
    "",
    ...(steps.length
      ? steps.map((step, index) => `${index + 1}. ${step}`)
      : ["1. 조리 순서를 입력해 주세요."]),
  ].join("\n");
}
