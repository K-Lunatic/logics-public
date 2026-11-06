export function findExactToolTarget<
  T extends { id: string; title?: string; name?: string },
>(items: T[], target: string): T | null {
  const byId = items.find((item) => item.id === target);
  if (byId) return byId;
  const normalized = target.trim().toLocaleLowerCase("ko-KR");
  const matches = items.filter(
    (item) =>
      (item.name || item.title || "").trim().toLocaleLowerCase("ko-KR") === normalized,
  );
  if (matches.length > 1) {
    throw new Error("같은 이름의 항목이 여러 개입니다. list가 반환한 ID를 사용해 주세요.");
  }
  return matches[0] || null;
}

export function completeInventoryDomain(
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const defaults =
    updates.domainType === "FOOD"
      ? { storageCondition: "ROOM", isOpened: false, openedDate: null, category: "INGREDIENT", expirationDate: updates.expirationDate || "" }
      : updates.domainType === "MEDICINE"
        ? { type: "ORAL", form: "TABLET", efficacy: "", sideEffects: [], dosage: "", expirationDate: updates.expirationDate || "" }
        : updates.domainType === "CLOTHES"
          ? { category: "TOP", season: ["ALL"], thickness: "NORMAL", lastWornDate: null, isDirty: false, laundryCycleDays: 7 }
          : updates.domainType === "BOOK"
            ? { author: "", readingStatus: "UNREAD" }
            : {};
  return { ...defaults, ...updates };
}

export function toolFailure(result: unknown): string | null {
  if (Array.isArray(result)) {
    for (const item of result) {
      const failure = toolFailure(item);
      if (failure) return failure;
    }
    return null;
  }
  if (!result || typeof result !== "object") return null;
  const value = result as Record<string, unknown>;
  if (value.success !== false) return null;
  return String(value.error || value.message || "도구 실행에 실패했습니다.");
}

export function hasToolUpdate(
  input: Record<string, unknown>,
  ignoredKeys = ["id"],
): boolean {
  return Object.entries(input).some(
    ([key, value]) => !ignoredKeys.includes(key) && value !== undefined,
  );
}

export function compactToolEvidence(
  result: unknown,
  maxLength = 2_000,
): unknown {
  try {
    const serialized = JSON.stringify(result);
    if (serialized.length <= maxLength) return result;
    return {
      truncated: true,
      preview: serialized.slice(0, maxLength),
    };
  } catch {
    return { truncated: true, preview: String(result).slice(0, maxLength) };
  }
}

export function formatSeoulDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
