export function assertDocumentPath(
  path: string,
  kind: "document" | "collection",
): string {
  const segments = path.split("/");
  const expectedParity = kind === "document" ? 0 : 1;
  if (
    !path ||
    segments.length % 2 !== expectedParity ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\u0000-\u001f?#\\]/.test(segment) ||
        /%(?:2f|5c)/i.test(segment),
    )
  ) {
    throw new Error(`유효하지 않은 ${kind} 경로입니다.`);
  }
  return path;
}

export function assertDocumentField(value: string): string {
  if (!value || /[/?#\\\u0000-\u001f]/.test(value)) {
    throw new Error("유효하지 않은 문서 필드입니다.");
  }
  return value;
}
