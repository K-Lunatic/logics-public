import { dbRemote } from "../adapters/dataStore";
import type { ShareSettings } from "../action/shareCircle.action";

export const EMPTY_SHARE_SETTINGS: ShareSettings = {
  inventoryCategories: [],
  scheduleCategories: [],
};

export async function readShareSettings(
  groupId: string,
  userId: string,
  legacySettings?: ShareSettings,
): Promise<ShareSettings> {
  return (
    (await dbRemote.get<ShareSettings>(
      `share_groups/${groupId}/member_settings/${userId}`,
    )) ||
    legacySettings ||
    EMPTY_SHARE_SETTINGS
  );
}
