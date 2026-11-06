// 📂 packages/assembler/src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { JWT } from "next-auth/jwt";
import { getConfig } from "@ink/engine";

// 🚀 [Pure Bone] raw Firestore SDK를 제거하고 표준 Remote 어댑터 수입!
import { dbRemote } from "../adapters/dataStore";
import { encryptPersonalSecret } from "./userSecrets";

interface TokenPayload {
  encryptedAccessToken: string;
  expiresAt: number;
  updatedAt: string;
  encryptedRefreshToken?: string;
}

/**
 * 🛡️ [Type Zone]: Custom Token 설계
 */
interface CustomToken extends JWT {
  accessToken?: string;
  expiresAt?: number;
  refreshToken?: string;
  error?: string;
}

/**
 * 🔄 Google OAuth Token Refresh & dbRemote Sync
 */
async function refreshAccessToken(token: CustomToken): Promise<CustomToken> {
  try {
    if (!token.refreshToken) {
      throw new Error("Missing refresh token");
    }

    const activeConfig = getConfig();

    console.log(`🔄 [Next-Auth RTR] Token expiring for user ${token.sub}. Requesting renewal...`);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: activeConfig.google.clientId,
        client_secret: activeConfig.google.clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
      method: "POST",
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    console.log(`✅ [Next-Auth RTR] Google token refreshed successfully.`);

    const newExpiresAt = Date.now() + (Number(refreshedTokens.expires_in) || 3600) * 1000;
    const newRefreshToken = refreshedTokens.refresh_token ?? token.refreshToken;

    if (token.sub) {
      const tokenPayload: TokenPayload = {
        encryptedAccessToken: encryptPersonalSecret(refreshedTokens.access_token),
        encryptedRefreshToken: encryptPersonalSecret(newRefreshToken),
        expiresAt: newExpiresAt,
        updatedAt: new Date().toISOString(),
      };

      // 🚀 [FIX]: token.sub 기반 정밀 격리 경로 적재
      await dbRemote.set(`users/${token.sub}/oauth/google`, tokenPayload);
      console.log(`✨ [Next-Auth RTR Sync] Remote token updated via adapter.`);
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: newExpiresAt,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    console.error("🚨 [Next-Auth RTR Failure]:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/drive.file",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, user }) {
      if (account?.provider === "google" && account.access_token && user?.id) {
        try {
          const now = Date.now();
          const expiresAt =
            typeof account.expires_at === "number"
              ? account.expires_at * 1000
              : now + (Number(account.expires_in) || 3600) * 1000;

          const tokenPayload: TokenPayload = {
            encryptedAccessToken: encryptPersonalSecret(account.access_token),
            expiresAt: expiresAt,
            updatedAt: new Date().toISOString(),
          };

          if (account.refresh_token) {
            tokenPayload.encryptedRefreshToken = encryptPersonalSecret(
              account.refresh_token,
            );
          } else {
            const previous = await dbRemote.get<{
              encryptedRefreshToken?: string;
              refreshToken?: string;
            }>(`users/${user.id}/oauth/google`);
            if (previous?.encryptedRefreshToken) {
              tokenPayload.encryptedRefreshToken = previous.encryptedRefreshToken;
            } else if (previous?.refreshToken) {
              tokenPayload.encryptedRefreshToken = encryptPersonalSecret(
                previous.refreshToken,
              );
            }
          }

          // 🚀 [FIX]: user.id 기반 정밀 격리 경로 적재
          await dbRemote.set(`users/${user.id}/oauth/google`, tokenPayload);
          console.log(`✨ [Next-Auth Sync] Google OAuth tokens synced for user ${user.id}`);

          return true;
        } catch (error) {
          console.error("🚨 [Next-Auth Sync Failure]:", error);
          return true;
        }
      }
      return true;
    },

    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;

        const customToken = token as CustomToken;
        const extendedSession = session as typeof session & {
          accessToken?: string;
          error?: string;
        };

        extendedSession.accessToken = customToken.accessToken;
        extendedSession.error = customToken.error;
      }
      return session;
    },

    async jwt({ token, account }) {
      if (account) {
        const now = Date.now();
        const expiresAt =
          typeof account.expires_at === "number"
            ? account.expires_at * 1000
            : now + (Number(account.expires_in) || 3600) * 1000;

        return {
          ...token,
          accessToken: account.access_token,
          expiresAt: expiresAt,
          refreshToken: account.refresh_token,
        };
      }

      const currentTimestamp = Date.now();
      const isTokenExpired = token.expiresAt
        ? currentTimestamp >= (token.expiresAt as number) - 300000
        : true;

      if (!isTokenExpired) {
        return token;
      }

      return await refreshAccessToken(token as CustomToken);
    },
  },
  pages: {
    signIn: "/",
  },
};
