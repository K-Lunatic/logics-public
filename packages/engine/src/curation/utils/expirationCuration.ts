import { LivingItem, FoodItem, MedicineItem } from "../../";

export interface ExpirationResult {
  expired: LivingItem[];        // 이미 유통기한이 지난 물품 ☠️
  expiringSoon: LivingItem[];   // 7일 이내 만료 임박 물품 ⚠️
  openedTooLong: LivingItem[];  // 개봉한 지 30일이 지난 물품 (신선도 하락) 📉
}

export const getExpirationCuration = (items: LivingItem[]): ExpirationResult => {
  const today = new Date().getTime();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const WARNING_DAYS = 7; // 7일 전부터 경고

  const expired: LivingItem[] = [];
  const expiringSoon: LivingItem[] = [];
  const openedTooLong: LivingItem[] = [];

  items.forEach((item) => {
    // 식품과 약품만 유통기한 추적 대상
    if (item.domainType === "FOOD" || item.domainType === "MEDICINE") {
      const target = item as FoodItem | MedicineItem;

      // 1. 유통기한(expirationDate) 체크
      if (target.expirationDate) {
        const expDate = new Date(target.expirationDate).getTime();
        const diffDays = Math.ceil((expDate - today) / MS_PER_DAY);

        if (diffDays < 0) {
          expired.push(item);
        } else if (diffDays <= WARNING_DAYS) {
          expiringSoon.push(item);
        }
      }

      // 2. 개봉 후(isOpened) 경과일 체크 (임의 기준: 30일)
      if ('isOpened' in target && target.isOpened && target.openedDate) {
        const openDate = new Date(target.openedDate).getTime();
        const openedDays = Math.floor((today - openDate) / MS_PER_DAY);
        
        if (openedDays >= 30) {
          openedTooLong.push(item);
        }
      }
    }
  });

  return { expired, expiringSoon, openedTooLong };
};
