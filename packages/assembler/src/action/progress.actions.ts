"use server";

import { getSecureUserIdOrThrow } from "../lib/authGuard";
import { progressRegistry } from "./shared";

export async function getChatProgressAction(): Promise<string> {
  return progressRegistry.get(await getSecureUserIdOrThrow()) || "";
}
