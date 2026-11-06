export function calculateBmi(weightKg?: number, heightCm?: number) {
  if (!weightKg || !heightCm) return undefined;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}
