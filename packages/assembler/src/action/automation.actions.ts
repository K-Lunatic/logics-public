"use server";

import { getSecureUserIdOrThrow } from "../lib/authGuard";
import {
  createAutomationAccess,
  readAutomationAccess,
  revokeAutomationAccess,
} from "../lib/automationAccess";

export async function getAutomationAccessAction() {
  const userId = await getSecureUserIdOrThrow();
  const access = await readAutomationAccess(userId);
  return {
    userId,
    enabled: Boolean(access),
    keyPrefix: access?.keyPrefix || null,
    createdAt: access?.createdAt || null,
  };
}

export async function createAutomationAccessAction() {
  const userId = await getSecureUserIdOrThrow();
  return { userId, ...(await createAutomationAccess(userId)) };
}

export async function revokeAutomationAccessAction(): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  await revokeAutomationAccess(userId);
}
