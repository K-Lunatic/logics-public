import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getConfig } from "@ink/engine";

import {
  authOptions,
  dbRemote,
  decryptServerSecret,
  encryptPersonalSecret,
} from "@ink/assembler/server";

interface GoogleOAuthToken {
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  updatedAt?: string;
  userId?: string;
  email?: string;
}

/**
 * ⚡ [100% 자가 수리] 만료된 구글 토큰을 감지하면 자동으로 갱신하고 dbRemote에 다시 보관하는 함수냥!
 */
async function getOrRefreshUserAccessToken(userId: string): Promise<string> {
  // 🚀 원시 파이어베이스 getDoc 대신 표준 어댑터로 토큰 인출냥!
  const tokenPath = `users/${userId}/oauth/google`;
  const tokenData = await dbRemote.get<GoogleOAuthToken>(tokenPath);

  const storedAccessToken =
    decryptServerSecret(tokenData?.encryptedAccessToken) ||
    tokenData?.accessToken;
  const storedRefreshToken =
    decryptServerSecret(tokenData?.encryptedRefreshToken) ||
    tokenData?.refreshToken;
  if (!tokenData || !storedAccessToken) {
    throw new Error("장부에 등록된 구글 OAuth 토큰이 없다냥.");
  }

  const now = Date.now();
  let currentAccessToken = storedAccessToken;

  // ⏱️ 토큰이 만료되었거나 만료 1분 전(버퍼 타임)이라면 실시간 강제 인공호흡 가동냥!
  if (tokenData.expiresAt && now >= tokenData.expiresAt - 60000) {
    console.log(`🔄 [Token Auto-Repair] 유저 ${userId}의 액세스 토큰 만료 임박 감지. 자동 갱신 시도냥.`);

    if (!storedRefreshToken) {
      throw new Error("액세스 토큰이 만료되었으나, 갱신할 수 있는 Refresh Token이 장부에 없다냥.");
    }

    const config = getConfig();

    // 구글 OAuth 엔드포인트 수동 타격
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        refresh_token: storedRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshResponse.ok) {
      const errLog = await refreshResponse.text();
      throw new Error(`Google_OAuth_Refresh_Failed: ${errLog}`);
    }

    const refreshData = await refreshResponse.json();
    currentAccessToken = refreshData.access_token;
    
    // 신규 수명 기한 연산 (expires_in 기본 1시간)
    const newExpiresAt = now + (Number(refreshData.expires_in) || 3600) * 1000;

    // 💾 신선한 토큰으로 dbRemote 어댑터 장부 동기화 업데이트!
    await dbRemote.set(tokenPath, {
      encryptedAccessToken: encryptPersonalSecret(currentAccessToken),
      encryptedRefreshToken: encryptPersonalSecret(storedRefreshToken),
      expiresAt: newExpiresAt,
      updatedAt: new Date().toISOString(),
    });

    console.log(`✅ [Token Auto-Repair] 유저 ${userId}의 신규 토큰이 장부에 안전하게 갱신되었다냥.`);
  }

  if (!tokenData.encryptedAccessToken) {
    await dbRemote.set(tokenPath, {
      encryptedAccessToken: encryptPersonalSecret(currentAccessToken),
      ...(storedRefreshToken
        ? { encryptedRefreshToken: encryptPersonalSecret(storedRefreshToken) }
        : {}),
      expiresAt: tokenData.expiresAt,
      updatedAt: new Date().toISOString(),
    });
  }

  return currentAccessToken;
}

/**
 * 📦 사제 개인의 구글 드라이브로 다이렉트 업로드하는 메인 파이프라인냥
 */
export async function POST(request: Request) {
  try {
    // 1. NextAuth 세션에서 안전하게 유저 고유 ID만 인출냥
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "현재 로그인하지 않았거나 유저 식별 세션이 유실되었다냥." },
        { status: 401 }
      );
    }

    // 2. 🔐 [핵심 무결성 확보]: 어댑터에서 직접 토큰을 인출하거나, 만료 시 자동 심폐소생냥!
    const userAccessToken = await getOrRefreshUserAccessToken(userId);

    const formData = await request.formData();
    const file = formData.get("file");
    const rawItemId = String(formData.get("itemId") || "item");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "압축된 파일 조각이 누락되었다냥." }, { status: 400 });
    }
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > 5_000_000) {
      return NextResponse.json(
        { error: "JPG, PNG, WEBP 이미지를 5MB 이하로 올려 주세요." },
        { status: 400 },
      );
    }
    const itemId = rawItemId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "item";
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];

    // 3. 구글 REST API Multipart related 바운더리 스트링 조립냥
    const boundary = "xxxx_ink_wms_pure_fetch_boundary_xxxx";
    const metadata = {
      name: `INK_WMS_${itemId}_${Date.now()}.${extension}`,
      mimeType: file.type,
    };

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const base64File = fileBuffer.toString("base64");

    const multipartBody = 
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${file.type}\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${base64File}\r\n` +
      `--${boundary}--`;

    // 4. 구글 드라이브로 수동 Fetch 슛!
    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!uploadResponse.ok) {
      const errLog = await uploadResponse.text();
      throw new Error(`Google_Drive_Upload_Failed: ${errLog}`);
    }

    const driveData = await uploadResponse.json();
    const fileId = driveData.id;

    const permissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      }
    );

    if (!permissionResponse.ok) {
      console.warn("⚠️ 드라이브 공유 권한 전파 지연 포착냥.");
    }

    // 6. 다이렉트 이미지 URL 가공 (💡 문자열 보간법 오타도 수정했다냥!)
    const directStreamableUrl = `https://drive.google.com/uc?id=${fileId}`;

    return NextResponse.json({
      success: true,
      fileId,
      imageUrl: directStreamableUrl,
    });

  } catch (error: unknown) {
    console.error("🚨 [Drive Endpoint Error]:", error);
    return NextResponse.json(
      { error: "이미지를 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
