// 📂 apps/web/src/lib/authGuard.ts (또는 packages/assembler/src/lib/authGuard.ts)
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function getSecureUserIdOrThrow(): Promise<string> {
  const session = await getServerSession(authOptions);
  const secureId = (session?.user as { id?: string })?.id;

  if (!secureId) {
    throw new Error(
      "🚨 [Security Violation]: 인증되지 않은 유효하지 않은 요청입니다냥!"
    );
  }
  return secureId;
}
