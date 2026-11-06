// packages/assembler/src/adapters/fileStore.ts

export const drive = {
  // 📥 1. 파일 다운로드
  get: async (fileId: string): Promise<Blob> => {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error("구글 드라이브 파일 인출 실패다냥!");
    return await res.blob();
  },
  // 📤 2. 파일 업로드 (Multi-part Base64/Blob -> Google Drive CDN)
  put: async (
    category: string,
    fileName: string,
    fileBlob: Blob | File,
    accessToken?: string
  ): Promise<{ fileId: string; url: string }> => {
    if (!accessToken) {
      throw new Error("구글 드라이브 접근 토큰이 필요합니다냥!");
    }
    const metadata = { name: `${category}_${fileName}`, mimeType: fileBlob.type || "application/octet-stream" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", fileBlob);

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    if (!res.ok) throw new Error("구글 드라이브 파일 업로드 실패다냥!");
    const data = await res.json();
    return { fileId: data.id, url: `https://lh3.googleusercontent.com/d/${data.id}` };
  },
};
