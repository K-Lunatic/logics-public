export async function compressImageBeforeUpload(
  file: File,
  maxWidth = 800,
  quality = 0.75,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 처리할 수 없습니다.");

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("이미지를 압축할 수 없습니다.")),
      "image/webp",
      quality,
    ),
  );
}
