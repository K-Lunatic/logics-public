import {
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { dbRemote } from "../adapters/dataStore";
import { hashAutomationKey } from "./automationKey";

export { hashAutomationKey } from "./automationKey";

interface AutomationAccess {
  keyHash: string;
  keyPrefix: string;
  createdAt: string;
}

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export async function createAutomationAccess(userId: string) {
  const key = `ink_live_${randomBytes(32).toString("base64url")}`;
  const access: AutomationAccess = {
    keyHash: hashAutomationKey(key),
    keyPrefix: key.slice(0, 17),
    createdAt: new Date().toISOString(),
  };
  await dbRemote.set(`users/${userId}/automation_access/master_document`, access);
  return { key, keyPrefix: access.keyPrefix, createdAt: access.createdAt };
}

export async function readAutomationAccess(userId: string) {
  if (!USER_ID_PATTERN.test(userId)) return null;
  return dbRemote.get<AutomationAccess>(
    `users/${userId}/automation_access/master_document`,
  );
}

export async function revokeAutomationAccess(userId: string): Promise<void> {
  await dbRemote.delete(`users/${userId}/automation_access/master_document`);
}

export async function authenticateAutomationRequest(
  request: Request,
): Promise<string | null> {
  const userId = request.headers.get("x-ink-user-id")?.trim() || "";
  const authorization = request.headers.get("authorization") || "";
  const key = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!USER_ID_PATTERN.test(userId) || !key.startsWith("ink_live_")) return null;

  const access = await readAutomationAccess(userId);
  if (!access) return null;
  const actual = Buffer.from(hashAutomationKey(key), "hex");
  const expected = Buffer.from(access.keyHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? userId
    : null;
}
