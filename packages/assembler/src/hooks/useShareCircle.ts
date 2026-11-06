// 📂 packages/assembler/src/hooks/useShareCircle.ts
"use client";

import { useDataStore } from "./useDataStore";
import {
  getActiveGroupAction,
  getMyShareSettingsAction,
  updateShareSettingsAction,
  getInvitationsAction,
  inviteUserAction,
  acceptInvitationAction,
  rejectInvitationAction,
  leaveShareGroupAction,
  type ShareMember, // 👈 요거 추가!
  type ShareGroup,
  type Invitation,
  type ShareSettings,
} from "../action/shareCircle.action";

export type { ShareMember, ShareGroup, Invitation, ShareSettings };

export function useShareCircle() {
  // 1. 현재 접속 유저의 공유 서클 그룹 상태
  const {
    data: activeGroup,
    updateData: setActiveGroup,
    loading: groupLoading,
  } = useDataStore<ShareGroup | null>({
    key: "share_groups",
    fetcher: getActiveGroupAction,
  });
  const {
    data: myShareSettings,
    updateData: setMyShareSettings,
    loading: settingsLoading,
  } = useDataStore<ShareSettings>({
    key: "share_settings",
    fetcher: getMyShareSettingsAction,
  });

  // 2. 나에게 도착한 초대장 목록
  const {
    data: invitations,
    updateData: setInvitations,
    loading: inviteLoading,
  } = useDataStore<Invitation[]>({
    key: "invitations",
    fetcher: getInvitationsAction,
  });

  // 🚀 새로운 멤버 초대 보내기 (서버 액션 연동)
  const inviteUser = async (targetEmail: string) => {
    if (!targetEmail) return;
    await inviteUserAction(targetEmail);

    // 초대 후 그룹 정보 동기화
    const updated = await getActiveGroupAction();
    if (updated) await setActiveGroup(updated);
  };

  // 🚀 초대장 수락 및 서클 결속 (서버 액션 연동)
  const acceptInvitation = async (inviteId: string) => {
    if (!invitations) return;
    await acceptInvitationAction(inviteId);

    // 수락 후 초대장 목록 로컬 갱신 (Optimistic UI)
    const updatedInvites = invitations.filter((inv) => inv.id !== inviteId);
    await setInvitations(updatedInvites);

    // 가입된 그룹 정보 동기화
    const joined = await getActiveGroupAction();
    if (joined) await setActiveGroup(joined);
  };

  const rejectInvitation = async (inviteId: string) => {
    if (!invitations) return;
    await rejectInvitationAction(inviteId);
    await setInvitations(invitations.filter((invite) => invite.id !== inviteId));
  };

  const leaveGroup = async () => {
    await leaveShareGroupAction();
    await setActiveGroup(null);
    await setMyShareSettings({
      inventoryCategories: [],
      scheduleCategories: [],
    });
  };

  const updateShareSettings = async (
    settings: ShareSettings
  ) => {
    const updated = await updateShareSettingsAction(settings);
    await setMyShareSettings(updated);
  };

  return {
    activeGroup,
    receivedInvites: (invitations || []).filter((i) => i.status === "PENDING"),
    inviteUser,
    acceptInvitation,
    rejectInvitation,
    leaveGroup,
    updateShareSettings,
    myShareSettings: myShareSettings || {
      inventoryCategories: [],
      scheduleCategories: [],
    },
    canEditShareSettings: Boolean(activeGroup),
    isLoading: groupLoading || inviteLoading || settingsLoading,
  };
}
