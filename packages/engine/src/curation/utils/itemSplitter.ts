import { LivingItem } from "../../";

// 원본 아이템 1개를 count 개수만큼 복제하여 배열로 반환
export const splitItem = (originalItem: LivingItem, splitCount: number): LivingItem[] => {
  if (splitCount <= 1) return [originalItem];

  const splittedItems: LivingItem[] = [];
  // 수량을 소분 개수만큼 나눔 (예: 10개를 3통에 나누면 3, 3, 4)
  const baseQuantity = Math.floor(originalItem.quantity / splitCount);
  const remainder = originalItem.quantity % splitCount;

  for (let i = 0; i < splitCount; i++) {
    const newItem: LivingItem = {
      ...originalItem,
      // QR 코드가 각기 다르게 부여되어야 하므로 새로운 ID 생성
      id: `${originalItem.id}-split-${Date.now()}-${i}`,
      // 마지막 통에 남은 자투리 수량 몰아주기
      quantity: i === splitCount - 1 ? baseQuantity + remainder : baseQuantity,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    splittedItems.push(newItem);
  }

  return splittedItems;
};
