let cachedToken: { value: string; expiresAt: number } | null = null;
let pendingToken: Promise<string | null> | null = null;

function base64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createServiceToken(): Promise<string | null> {
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    // ponytail: 로컬 개발은 기존 Firebase Rules를 허용한다. 배포 환경은 서비스 계정 없이는 실패한다.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FIREBASE_CLIENT_EMAIL과 FIREBASE_PRIVATE_KEY가 필요합니다.",
      );
    }
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: email,
      sub: email,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/datastore",
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(pem);
  const keyBytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("Firebase 서비스 계정 인증에 실패했습니다.");
  const payload = await response.json();
  if (typeof payload.access_token !== "string") {
    throw new Error("Firebase 서비스 계정 토큰이 없습니다.");
  }
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
  };
  return cachedToken.value;
}

export async function getFirestoreAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.value;
  }
  if (!pendingToken) {
    pendingToken = createServiceToken().finally(() => {
      pendingToken = null;
    });
  }
  return pendingToken;
}

export async function firestoreHeaders(
  headers: Record<string, string> = {},
  overrideToken?: string,
): Promise<Record<string, string>> {
  const token = overrideToken || (await getFirestoreAccessToken());
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}
