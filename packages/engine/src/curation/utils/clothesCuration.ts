import { ClothesItem, WeatherSnapshot } from "../../";

export interface CurationResult {
  recommendedOOTD: ClothesItem[]; // 내일 입을 추천 코디
  laundryAlerts: ClothesItem[];   // 지금 빨아야 하는 옷
}

export const getClothesCuration = (
  clothes: ClothesItem[],
  tomorrowWeather: WeatherSnapshot
): CurationResult => {
  const temp = tomorrowWeather.feelsLike; // 체감 온도 기준

  // 1. 내일 기온에 맞는 '두께(Thickness)' 매핑 로직
  let targetThickness: "THIN" | "NORMAL" | "THICK" = "NORMAL";
  if (temp >= 23) targetThickness = "THIN";       // 더운 날
  else if (temp <= 10) targetThickness = "THICK"; // 추운 날
  else targetThickness = "NORMAL";                // 선선한 날

  // 2. 내일 입을 추천 코디 필터링 (깨끗하고, 두께 맞고, 보관 중인 옷)
  const recommendedOOTD = clothes.filter(
    (item) => 
      !item.isDirty && 
      item.status === "STORED" && 
      item.thickness === targetThickness
  );

  // 3. 빨래해야 할 옷 필터링
  const laundryAlerts = clothes.filter((item) => {
    // 이미 더럽다고 체크되어 있거나
    if (item.isDirty) return true;

    // 마지막으로 입은 날로부터 세탁 주기(laundryCycleDays)가 지났다면 빨래 추천
    if (item.lastWornDate) {
      const lastWorn = new Date(item.lastWornDate).getTime();
      const today = new Date().getTime();
      const diffDays = Math.floor((today - lastWorn) / (1000 * 60 * 60 * 24));
      if (diffDays >= item.laundryCycleDays) return true;
    }

    return false;
  });

  return { recommendedOOTD, laundryAlerts };
};
