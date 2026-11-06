import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { dbRemote } from "../adapters/dataStore";
import type { SupportedAiModel } from "../aiSettings";

export type PersonalSecretName = "geminiApiKey" | "weatherApiKey";
export type GeminiModelId = SupportedAiModel;

export interface StoredUserSettings {
  nickname: string;
  tone: "CAT_NYANG" | "POLITE" | "ANALYTICAL" | "CUSTOM";
  customInstructions: string;
  fontScale: "SMALL" | "MEDIUM" | "LARGE";
  aiModel?: GeminiModelId;
  aiCapabilityMode?: "AUTO" | "LOW" | "BALANCED" | "HIGH";
  aiReliabilityMode?: "FAST" | "BALANCED" | "RELIABLE";
  aiRequestsPerMinute?: number;
  encryptedSecrets?: Partial<Record<PersonalSecretName, string>>;
  updatedAt: string;
}

function encryptionKey(): Buffer {
  const secret = process.env.USER_SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("사용자 설정 암호화 키가 없습니다.");
  return createHash("sha256").update(secret).digest();
}

function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((item) => item.toString("base64url"))
    .join(".");
}

function unseal(value?: string): string | null {
  if (!value) return null;
  try {
    const [iv, tag, encrypted] = value.split(".").map((item) => Buffer.from(item, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export async function readStoredUserSettings(userId: string): Promise<StoredUserSettings | null> {
  return dbRemote.get<StoredUserSettings>(`users/${userId}/settings/master_document`);
}

export async function writeStoredUserSettings(
  userId: string,
  settings: StoredUserSettings
): Promise<void> {
  await dbRemote.set(`users/${userId}/settings/master_document`, settings);
}

export function encryptPersonalSecret(value: string): string {
  return seal(value);
}

export function decryptServerSecret(value?: string): string | null {
  return unseal(value);
}

export async function getPersonalSecretForUser(
  userId: string,
  name: PersonalSecretName
): Promise<string | null> {
  const settings = await readStoredUserSettings(userId);
  return unseal(settings?.encryptedSecrets?.[name]);
}
