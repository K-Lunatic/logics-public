// 📂 apps/web/src/actions/shareCircle.action.ts (또는 해당 서버 액션 경로)
"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../lib/auth";
import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import {
  EMPTY_SHARE_SETTINGS,
  readShareSettings,
} from "../lib/shareSettings";

export interface ShareMember {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MEMBER";
}

export interface ShareGroup {
  id: string;
  name: string;
  createdById?: string;
  ownerId?: string;
  members: ShareMember[];
  shareSettings: ShareSettings;
}

export interface ShareSettings {
  inventoryCategories: Array<"FOOD" | "MEDICINE" | "CLOTHES" | "BOOK" | "HOUSEHOLD" | "ETC">;
  scheduleCategories: Array<"WORK" | "UTILITY" | "PERSONAL" | "HOLIDAY" | "GLOBAL">;
}

const shareSettingsSchema = z.object({
  inventoryCategories: z.array(
    z.enum(["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"]),
  ).max(6),
  scheduleCategories: z.array(
    z.enum(["WORK", "UTILITY", "PERSONAL", "HOLIDAY", "GLOBAL"]),
  ).max(5),
});

function getGroupCreatorId(group: ShareGroup): string {
  return group.createdById || group.ownerId || "";
}

export interface Invitation {
  id: string;
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterEmail: string;
  targetEmail: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
}

// 🔐 세션 쿠키에서 유저 이메일 안전하게 추출
async function getSecureUserEmailOrThrow(): Promise<string> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    throw new Error("🚨 [Security Violation]: 인증된 이메일 정보가 없다냥!");
  }
  return email;
}

// 1. 활성 그룹 조회
export async function getActiveGroupAction(): Promise<ShareGroup | null> {
  const secureUserId = await getSecureUserIdOrThrow();
  const group = await dbRemote.get<ShareGroup>(
    `users/${secureUserId}/share_groups/master_document`
  );
  if (!group) return null;

  let members = await dbRemote.list<ShareMember>(`share_groups/${group.id}/members`);
  if (members.length === 0 && Array.isArray(group.members)) {
    const legacyMembership = group.members.find(
      (member) => member.userId === secureUserId,
    );
    if (legacyMembership) {
      members = group.members;
      await Promise.all(
        members.map((member) =>
          dbRemote.set(`share_groups/${group.id}/members/${member.userId}`, member)
        )
      );
    }
  }
  if (!members.some((member) => member.userId === secureUserId)) {
    await dbRemote.delete(`users/${secureUserId}/share_groups/master_document`);
    return null;
  }
  return { ...group, members };
}

export async function getMyShareSettingsAction(): Promise<ShareSettings> {
  const userId = await getSecureUserIdOrThrow();
  const group = await getActiveGroupAction();
  if (!group) return EMPTY_SHARE_SETTINGS;
  return readShareSettings(
    group.id,
    userId,
    getGroupCreatorId(group) === userId ? group.shareSettings : undefined
  );
}

export async function updateShareSettingsAction(
  shareSettings: ShareSettings
): Promise<ShareSettings> {
  const secureUserId = await getSecureUserIdOrThrow();
  const group = await getActiveGroupAction();
  if (!group) throw new Error("연결된 공유 그룹이 없습니다.");
  const cleanSettings = shareSettingsSchema.parse(shareSettings);
  await dbRemote.set(
    `share_groups/${group.id}/member_settings/${secureUserId}`,
    cleanSettings
  );
  return cleanSettings;
}

// 3. 초대장 목록 조회
export async function getInvitationsAction(): Promise<Invitation[]> {
  await getSecureUserIdOrThrow();
  const email = await getSecureUserEmailOrThrow();
  const encodedEmail = encodeURIComponent(email.toLowerCase());
  let invitations = await dbRemote.list<Invitation>(
    `invitations/${encodedEmail}/items`
  );
  if (invitations.length === 0) {
    const legacy = await dbRemote.get<unknown>(`invitations/${encodedEmail}`);
    invitations = Array.isArray(legacy) ? legacy : [];
    await Promise.all(
      invitations.map((invitation) =>
        dbRemote.set(
          `invitations/${encodedEmail}/items/${invitation.id}`,
          invitation
        )
      )
    );
  }
  return invitations;
}

// 4. 새로운 멤버 초대
export async function inviteUserAction(targetEmail: string): Promise<void> {
  const secureUserId = await getSecureUserIdOrThrow();
  const userEmail = await getSecureUserEmailOrThrow();
  const normalizedTargetEmail = z
    .string()
    .trim()
    .email()
    .max(254)
    .parse(targetEmail)
    .toLowerCase();

  if (!normalizedTargetEmail || normalizedTargetEmail === userEmail.toLowerCase()) return;

  // 그룹이 없는 경우 자동 생성
  let currentGroup = await getActiveGroupAction();
  if (!currentGroup) {
    currentGroup = {
      id: `group_${secureUserId}`,
      name: `${userEmail.split("@")[0]}의 살림 공간`,
      createdById: secureUserId,
      shareSettings: {
        inventoryCategories: [],
        scheduleCategories: [],
      },
      members: [
        {
          userId: secureUserId,
          name: userEmail.split("@")[0],
          email: userEmail,
          role: "MEMBER",
        },
      ],
    };
    await dbRemote.set(
      `users/${secureUserId}/share_groups/master_document`,
      currentGroup
    );
    await dbRemote.set(
      `share_groups/${currentGroup.id}/members/${secureUserId}`,
      currentGroup.members[0]
    );
  }

  const newInvite: Invitation = {
    id: `inv_${crypto.randomUUID()}`,
    groupId: currentGroup.id,
    groupName: currentGroup.name,
    inviterId: secureUserId,
    inviterEmail: userEmail,
    targetEmail: normalizedTargetEmail,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };

  // 타겟 유저 영역에 안전하게 초대장 저장 (서버 단 수행)
  await dbRemote.set(
    `invitations/${encodeURIComponent(normalizedTargetEmail)}/items/${newInvite.id}`,
    newInvite
  );
}

// 5. 초대장 수락
export async function acceptInvitationAction(inviteId: string): Promise<void> {
  const secureUserId = await getSecureUserIdOrThrow();
  const userEmail = await getSecureUserEmailOrThrow();

  const invitations = await getInvitationsAction();
  const targetInvite = invitations.find((inv) => inv.id === inviteId);
  if (
    !targetInvite ||
    targetInvite.status !== "PENDING" ||
    targetInvite.targetEmail.toLowerCase() !== userEmail.toLowerCase()
  ) {
    throw new Error("유효한 초대장을 찾지 못했습니다.");
  }

  const currentGroup = await getActiveGroupAction();
  if (currentGroup && currentGroup.id !== targetInvite.groupId) {
    await Promise.all([
      dbRemote.delete(`share_groups/${currentGroup.id}/members/${secureUserId}`),
      dbRemote.delete(`share_groups/${currentGroup.id}/member_settings/${secureUserId}`),
    ]);
  }

  const inviterGroup = await dbRemote.get<ShareGroup>(
    `users/${targetInvite.inviterId}/share_groups/master_document`
  );
  if (!inviterGroup || inviterGroup.id !== targetInvite.groupId) {
    throw new Error("초대 그룹 정보가 일치하지 않습니다.");
  }
  const inviterMembership = await dbRemote.get<ShareMember>(
    `share_groups/${inviterGroup.id}/members/${targetInvite.inviterId}`,
  );
  if (!inviterMembership) {
    throw new Error("초대한 사용자가 더 이상 공유 그룹에 없습니다.");
  }

  const newMember: ShareMember = {
    userId: secureUserId,
    name: userEmail.split("@")[0],
    email: userEmail,
    role: "MEMBER",
  };

  await Promise.all(
    [
      dbRemote.delete(
        `invitations/${encodeURIComponent(userEmail.toLowerCase())}/items/${inviteId}`
      ),
      dbRemote.set(
        `share_groups/${inviterGroup.id}/members/${secureUserId}`,
        newMember
      ),
      dbRemote.set(`users/${secureUserId}/share_groups/master_document`, {
        ...inviterGroup,
        members: [],
      }),
    ]
  );
}

export async function rejectInvitationAction(inviteId: string): Promise<void> {
  await getSecureUserIdOrThrow();
  const userEmail = await getSecureUserEmailOrThrow();
  await dbRemote.delete(
    `invitations/${encodeURIComponent(userEmail.toLowerCase())}/items/${inviteId}`
  );
}

export async function leaveShareGroupAction(): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  const group = await getActiveGroupAction();
  if (!group) return;
  await Promise.all([
    dbRemote.delete(`share_groups/${group.id}/members/${userId}`),
    dbRemote.delete(`share_groups/${group.id}/member_settings/${userId}`),
    dbRemote.delete(`users/${userId}/share_groups/master_document`),
  ]);
}
