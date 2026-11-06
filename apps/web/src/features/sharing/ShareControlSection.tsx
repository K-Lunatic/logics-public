"use client";

import { useState } from "react";
// 🚀 [교정] 함수형 훅인 useShareCircle을 수입하여 선언적으로 상태를 구독합니다.
import { useShareCircle } from "@ink/assembler";
import { Input, Button, Badge, Card } from "@/components/ui";

export function ShareControlSection() {
  // 🚀 통합 공유 서클 서브 엔진 가동 (실시간 리액티브 스트림 바인딩)
  const {
    activeGroup,
    receivedInvites,
    inviteUser,
    acceptInvitation,
    rejectInvitation,
    leaveGroup,
    updateShareSettings,
    canEditShareSettings,
    myShareSettings,
    isLoading,
  } = useShareCircle();

  const [emailInput, setEmailInput] = useState("");
  const [message, setMessage] = useState("");
  const inventoryOptions = ["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"] as const;
  const scheduleOptions = ["WORK", "UTILITY", "PERSONAL", "HOLIDAY", "GLOBAL"] as const;

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    try {
      await inviteUser(emailInput.trim());
      setEmailInput("");
      setMessage("초대장을 보냈습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초대장을 보내지 못했습니다.");
    }
  };

  const stopSharing = async () => {
    if (!window.confirm("이 공유 연결을 중단할까요? 내 물품과 일정이 상대에게 더 이상 표시되지 않습니다.")) return;
    await leaveGroup();
    setMessage("공유 연결을 중단했습니다.");
  };

  const toggleInventory = async (category: typeof inventoryOptions[number]) => {
    if (!activeGroup) return;
    const current = myShareSettings.inventoryCategories;
    await updateShareSettings({
      inventoryCategories: current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
      scheduleCategories: myShareSettings.scheduleCategories,
    });
  };

  const toggleSchedule = async (category: typeof scheduleOptions[number]) => {
    if (!activeGroup) return;
    const current = myShareSettings.scheduleCategories;
    await updateShareSettings({
      inventoryCategories: myShareSettings.inventoryCategories,
      scheduleCategories: current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    });
  };

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-300">
      {/* 도착한 초대장 알림판 */}
      {receivedInvites.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30 shadow-xs">
          <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
            ✉️ 새로운 공간 초대장이 있습니다!
          </h3>
          <div className="space-y-3">
            {receivedInvites.map((inv) => (
              <div
                key={inv.id}
                className="bg-white p-4 rounded-xl border border-amber-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 shadow-xs"
              >
                <div>
                  <span className="text-xs font-bold text-amber-600">
                    FROM: {inv.inviterEmail}
                  </span>
                  <p className="font-black text-gray-800 text-base mt-0.5">
                    [{inv.groupName}] 공간으로의 초대
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-amber-600 text-white hover:bg-amber-700 border-none shadow-none"
                    onClick={() => acceptInvitation(inv.id!)}
                  >
                    수락 및 연결
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => rejectInvitation(inv.id!)}
                  >
                    거절
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 활성화된 공유 멤버 명부 */}
        <div className="md:col-span-2">
          <Card
            title={
              activeGroup
                ? `👥 ${activeGroup.name}`
                : "👥 연결된 공유 공간이 없습니다"
            }
          >
            {activeGroup ? (
              <div className="space-y-3 mt-2">
                {activeGroup.members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100 transition-all hover:bg-gray-100/70"
                  >
                    <div>
                      <strong className="text-gray-800 text-base">
                        {member.name}
                      </strong>
                      <span className="text-xs text-gray-400 block mt-0.5">
                        {member.email}
                      </span>
                    </div>
                    <Badge
                      variant="info"
                    >
                      🔗 공유 멤버
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center border-2 border-dashed border-gray-100 rounded-2xl mt-2">
                <p className="text-sm text-gray-400 font-bold">
                  오른쪽 폼을 이용해 멤버를 초대하고 공유 서클을 개설해 보세요.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* 유저 초청 센터 */}
        <div>
          <Card title="✨ 새로운 멤버 초대">
            <form onSubmit={handleInviteSubmit} className="space-y-4 mt-2">
              <p className="text-xs text-gray-400 leading-relaxed">
                상대방의 구글 계정 이메일을 입력하면 해당 유저의 Blank
                대시보드에 초대장이 발송됩니다.
              </p>
              <Input
                label="구글 이메일 주소"
                placeholder="user@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "초대장 날리는 중..." : "공간 초대장 발송 🚀"}
              </Button>
            </form>
          </Card>
        </div>
      </div>

      {activeGroup && (
        <Card title="🔐 공유 범위">
          <p className="mb-4 text-xs text-stone-500">
            내가 선택한 분류만 다른 멤버에게 공개됩니다. 각 멤버는 자신의 공개
            범위를 직접 관리합니다.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <ShareCategoryPicker
              title="물품 분류"
              options={inventoryOptions}
              selected={myShareSettings.inventoryCategories}
              disabled={!canEditShareSettings || isLoading}
              onToggle={toggleInventory}
            />
            <ShareCategoryPicker
              title="일정 분류"
              options={scheduleOptions}
              selected={myShareSettings.scheduleCategories}
              disabled={!canEditShareSettings || isLoading}
              onToggle={toggleSchedule}
            />
          </div>
          <div className="mt-6 border-t border-stone-100 pt-4">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void stopSharing()}
              className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              공유 연결 중단
            </button>
          </div>
        </Card>
      )}
      {message && <p role="status" className="text-sm text-stone-500">{message}</p>}
    </div>
  );
}

function ShareCategoryPicker<T extends string>({
  title,
  options,
  selected,
  disabled,
  onToggle,
}: {
  title: string;
  options: readonly T[];
  selected: T[];
  disabled: boolean;
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-bold text-stone-800">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              selected.includes(option)
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
