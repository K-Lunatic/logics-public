import { z } from "zod";

// 📋 [유저 기본 정보 무결성 스키마 승격]
export const appUserSchema = z.object({
  uid: z.string().describe("유저 고유 식별자 UID"),
  email: z.string().email().nullable().describe("유저 이메일 (선택적 제공 대응)"),
  displayName: z.string().nullable().describe("유저 프로필 노출 이름"),
  photoURL: z.string().url().nullable().describe("유저 프로필 이미지 원격 주소"),
  lastLoginAt: z.string().describe("ISO 8601 형식의 마지막 로그인 타임스탬프"),
});

export const userProfileSchema = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  fullName: z.string().trim().min(1).max(80),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  region: z.string().trim().min(1).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// 외부 패키지가 땡겨 쓸 수 있도록 깨끗하게 추론 타입 수출
export type AppUser = z.infer<typeof appUserSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
