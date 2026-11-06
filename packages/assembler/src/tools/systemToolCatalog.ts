import type { DataType, StoredTool } from "../types";

type Param = [key: string, type: DataType, required?: boolean, description?: string];

function tool(
  id: string,
  name: string,
  description: string,
  params: Param[] = []
): StoredTool {
  return {
    id,
    name,
    description,
    scope: "system",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    blocks: [{
      id: `${id}-input`,
      type: "INPUT",
      title: `${name} 입력`,
      inputParams: params.map(([key, type, required = false, paramDescription]) => ({
        id: `${id}-${key}`,
        key,
        type,
        required,
        description: paramDescription,
      })),
    }],
  };
}

export function getDefaultSystemTools(): StoredTool[] {
  const inventoryFields: Param[] = [
    ["name", "string", true, "물품 이름"],
    ["quantity", "number", false, "수량"],
    ["unit", "string", false, "단위"],
    ["domainType", "string", false, "FOOD, MEDICINE, CLOTHES, BOOK, HOUSEHOLD, ETC"],
    ["location", "string", false, "보관 위치"],
    ["expirationDate", "string", false, "소비기한 YYYY-MM-DD"],
  ];
  const scheduleFields: Param[] = [
    ["title", "string", true, "일정 제목"],
    ["date", "string", false, "날짜 YYYY-MM-DD"],
    ["startTime", "string", false, "시작 시간 HH:mm"],
    ["endTime", "string", false, "종료 시간 HH:mm"],
    ["category", "string", false, "WORK, UTILITY, PERSONAL, HOLIDAY, GLOBAL"],
    ["note", "string", false, "메모"],
  ];
  const financeFields: Param[] = [
    ["type", "string", true, "INCOME 또는 EXPENSE"],
    ["amount", "number", true, "금액"],
    ["category", "string", true, "분류"],
    ["assetAccount", "string", false, "현금, 카드 등 결제 자산"],
    ["description", "string", true, "내역"],
    ["date", "string", true, "날짜 YYYY-MM-DD"],
    ["isFixed", "boolean", false, "고정지출 여부"],
  ];
  const nutritionFields: Param[] = [
    ["calories", "number", false, "예상 열량 kcal"],
    ["carbohydrate", "number", false, "예상 탄수화물 g"],
    ["protein", "number", false, "예상 단백질 g"],
    ["fat", "number", false, "예상 지방 g"],
  ];
  const mealFields: Param[] = [
    ["date", "string", true, "날짜 YYYY-MM-DD"],
    ["mealType", "string", true, "BREAKFAST, LUNCH, DINNER, SNACK"],
    ["title", "string", true, "메뉴 이름"],
    ["sourceType", "string", true, "HOME, RESTAURANT, DELIVERY"],
    ["restaurantName", "string", false, "식당 또는 배달처"],
    ["restaurantAddress", "string", false, "주소 또는 지점"],
    ["recipe", "string", false, "직접 조리 레시피"],
    ["ingredients", "json", false, "재료 이름 배열"],
    ...nutritionFields,
  ];
  const healthMeasurementFields: Param[] = [
    ["date", "string", true, "측정 날짜 YYYY-MM-DD"],
    ["weightKg", "number", false, "몸무게 kg"],
    ["bodyFatPercent", "number", false, "체지방률 %"],
    ["skeletalMuscleKg", "number", false, "골격근량 kg"],
    ["bmi", "number", false, "BMI"],
    ["bodyFatKg", "number", false, "체지방량 kg"],
    ["visceralFatLevel", "number", false, "내장지방지수"],
    ["fatFreeMassKg", "number", false, "제지방체중 kg"],
    ["muscleMassKg", "number", false, "근육량 kg"],
    ["boneMassKg", "number", false, "골질량 kg"],
    ["mineralsKg", "number", false, "무기질 kg"],
    ["waistHipRatio", "number", false, "복부비만율"],
    ["bodyWaterPercent", "number", false, "체수분 %"],
    ["proteinPercent", "number", false, "단백질 %"],
    ["obesityDegreePercent", "number", false, "비만도 %"],
    ["bmi2018", "number", false, "BMI(~2018)"],
    ["basalMetabolicRate", "number", false, "기초대사량 kcal"],
    ["bodyAge", "number", false, "신체나이"],
    ["standardWeightKg", "number", false, "표준체중 kg"],
    ["calories", "number", false, "하루 섭취 열량 kcal"],
    ["carbohydrate", "number", false, "하루 탄수화물 g"],
    ["protein", "number", false, "하루 단백질 g"],
    ["fat", "number", false, "하루 지방 g"],
    ["source", "string", false, "MANUAL, APPLE_HEALTH, ATFLEE_IMPORT"],
    ["externalId", "string", false, "외부 데이터 중복 방지 ID"],
  ];

  return [
    tool("sys-environment-get-weather", "environment.getWeather", "도시의 현재 또는 미래 시간별 날씨를 조회합니다.", [
      ["city", "string", true, "도시명 (예: 서울특별시, Seoul)"],
      ["date", "string", false, "조회 날짜 YYYY-MM-DD, 생략하면 오늘"],
      ["time", "string", false, "조회 시각 HH:mm, 생략하면 현재 시각"],
    ]),
    tool("sys-inventory-list", "inventory.list", "전체 재고를 ID와 저장된 모든 속성까지 조회합니다."),
    tool("sys-inventory-get", "inventory.get", "물품 한 건의 모든 속성을 조회합니다.", [["id", "string", true, "inventory.list가 반환한 물품 ID 또는 정확한 이름"]]),
    tool("sys-inventory-add", "inventory.add", "재고 한 건을 추가합니다.", inventoryFields),
    tool("sys-inventory-update", "inventory.update", "재고 한 건을 수정합니다.", [["id", "string", true, "물품 ID 또는 이름"], ...inventoryFields.map(([key, type, , description]) => [key, type, false, description] as Param)]),
    tool("sys-inventory-delete", "inventory.delete", "재고 한 건을 삭제합니다.", [["id", "string", true, "물품 ID 또는 이름"]]),
    tool("sys-inventory-batch-add", "inventory.batchAdd", "여러 재고를 추가합니다.", [["items", "json", true, "물품 객체 배열"]]),
    tool("sys-inventory-batch-update", "inventory.batchUpdate", "여러 재고를 수정합니다.", [["updatesList", "json", true, "수정 객체 배열"]]),
    tool("sys-schedule-list", "schedule.list", "전체 일정을 조회합니다."),
    tool("sys-schedule-add", "schedule.add", "일정 한 건을 추가합니다.", scheduleFields),
    tool("sys-schedule-update", "schedule.update", "일정 한 건을 수정합니다.", [["id", "string", true, "일정 ID 또는 제목"], ...scheduleFields.map(([key, type, , description]) => [key, type, false, description] as Param)]),
    tool("sys-schedule-delete", "schedule.delete", "일정 한 건을 삭제합니다.", [["id", "string", true, "일정 ID 또는 제목"]]),
    tool("sys-schedule-batch-add", "schedule.batchAdd", "여러 일정을 추가합니다.", [["events", "json", true, "일정 객체 배열"]]),
    tool("sys-schedule-batch-update", "schedule.batchUpdate", "여러 일정을 수정합니다.", [["updatesList", "json", true, "수정 객체 배열"]]),
    tool("sys-finance-list", "finance.list", "지정한 달의 가계부를 조회합니다.", [["month", "string", false, "YYYY-MM, 생략하면 이번 달"]]),
    tool("sys-finance-transaction-add", "finance.transaction.add", "수입 또는 지출 내역을 추가합니다.", financeFields),
    tool("sys-finance-transaction-update", "finance.transaction.update", "가계부 내역을 수정합니다.", [["id", "string", true, "거래 ID"], ...financeFields.map(([key, type, , description]) => [key, type, false, description] as Param), ["scope", "string", false, "ONE 또는 SERIES"]]),
    tool("sys-finance-transaction-delete", "finance.transaction.delete", "가계부 내역을 삭제합니다.", [["id", "string", true, "거래 ID"], ["scope", "string", false, "ONE 또는 SERIES"]]),
    tool("sys-finance-budget-set", "finance.budget.set", "월 예산을 설정합니다.", [["month", "string", true, "YYYY-MM"], ["budget", "number", true, "월 예산"]]),
    tool("sys-finance-asset-add", "finance.asset.add", "보유 자산을 등록합니다.", [["name", "string", true, "자산 이름"], ["category", "string", true, "자산 분류"], ["balance", "number", true, "현재 잔액"], ["note", "string", false, "메모"]]),
    tool("sys-finance-asset-update", "finance.asset.update", "보유 자산을 수정합니다.", [["id", "string", true, "자산 ID"], ["name", "string", false, "자산 이름"], ["category", "string", false, "자산 분류"], ["balance", "number", false, "현재 잔액"], ["note", "string", false, "메모"]]),
    tool("sys-finance-asset-delete", "finance.asset.delete", "보유 자산을 삭제합니다.", [["id", "string", true, "자산 ID"]]),
    tool("sys-finance-summary", "finance.summary", "지정한 달의 수입·지출·예산·상위 지출 분류를 계산합니다.", [["month", "string", false, "YYYY-MM, 생략하면 이번 달"]]),
    tool("sys-meal-list", "meal.list", "기간 내 식단과 저장된 예상 영양소를 조회합니다.", [["start", "string", true, "YYYY-MM-DD"], ["end", "string", true, "YYYY-MM-DD"]]),
    tool("sys-meal-add", "meal.add", "식단 한 건을 추가합니다. 영양소가 없으면 AI가 예상 탄단지와 열량을 보완합니다.", mealFields),
    tool("sys-meal-update", "meal.update", "식단 한 건을 수정합니다.", [["id", "string", true, "meal.list가 반환한 ID"], ...mealFields.map(([key, type, , description]) => [key, type, false, description] as Param)]),
    tool("sys-meal-delete", "meal.delete", "식단 한 건을 삭제합니다.", [["id", "string", true, "식단 ID"]]),
    tool("sys-meal-nutrition-estimate", "meal.nutrition.estimate", "메뉴·재료·레시피로 예상 탄수화물·단백질·지방·열량을 계산합니다.", [["title", "string", true, "메뉴 이름"], ["ingredients", "json", false, "재료 배열"], ["recipe", "string", false, "레시피"], ["servingDescription", "string", false, "인분 또는 양"]]),
    tool("sys-meal-plan-add-generated", "meal.plan.addGenerated", "일정·재무·건강·기호·재고와 소비기한을 종합해 1~14일 식단과 레시피를 생성하고 저장합니다.", [["startDate", "string", true, "YYYY-MM-DD"], ["days", "number", false, "1~14일"], ["mealsPerDay", "number", false, "하루 1~3끼"], ["goal", "string", false, "식단 목표"], ["preferences", "string", false, "선호·기피 음식"], ["maxBudget", "number", false, "기간 최대 식비"]]),
    tool("sys-meal-recipe-search", "meal.recipe.search", "Google 검색으로 검증된 외부 레시피·YouTube 영상·대표 이미지를 찾습니다.", [["query", "string", true, "메뉴 또는 찾을 레시피"], ["limit", "number", false, "최대 결과 수 1~10"]]),
    tool("sys-meal-reference-set", "meal.reference.set", "선택한 외부 레시피와 대표 이미지를 식단에 저장합니다.", [["mealId", "string", true, "식단 ID"], ["recipeReferences", "json", true, "meal.recipe.search 결과 배열"], ["imageUrl", "string", false, "대표 이미지 URL"]]),
    tool("sys-meal-feedback-list", "meal.feedback.list", "과거 식단 평가를 조회합니다.", [["mealId", "string", false, "특정 식단 ID"]]),
    tool("sys-meal-feedback-set", "meal.feedback.set", "별점·태그·메모를 저장해 다음 맞춤 식단에 반영합니다.", [["mealId", "string", true, "식단 ID"], ["rating", "number", true, "1~5점"], ["tags", "json", false, "짧은 평가 태그 배열"], ["comment", "string", false, "상세 피드백"]]),
    tool("sys-health-profile-get", "health.profile.get", "키와 일일 권장 섭취 열량 기준을 조회합니다."),
    tool("sys-health-profile-update", "health.profile.update", "키와 일일 권장 섭취 열량 기준을 수정합니다.", [["heightCm", "number", false, "키 cm"], ["recommendedCalories", "number", false, "일일 권장 열량 kcal"]]),
    tool("sys-health-measurement-list", "health.measurement.list", "최근 체성분과 섭취 영양 기록을 조회합니다.", [["limit", "number", false, "최대 조회 건수"]]),
    tool("sys-health-measurement-add", "health.measurement.add", "앳플리 또는 Apple 건강 앱 호환 체성분·영양 기록을 추가합니다.", healthMeasurementFields),
    tool("sys-health-care-list", "health.care.list", "복약·처치·점검 루틴과 미확인 기록을 조회합니다."),
    tool("sys-health-care-add", "health.care.add", "복약에 한정되지 않은 반복 건강 행동을 등록합니다.", [["title", "string", true, "행동 이름"], ["kind", "string", true, "MEDICATION, TREATMENT, CHECK, CUSTOM"], ["times", "json", true, "HH:mm 배열"], ["daysOfWeek", "json", false, "요일 숫자 배열, 일요일 0"], ["startDate", "string", true, "YYYY-MM-DD"], ["endDate", "string", false, "YYYY-MM-DD"], ["instructions", "string", false, "조치 방법"]]),
    tool("sys-health-care-update-status", "health.care.updateStatus", "미확인 건강 행동을 완료 또는 미실행으로 기록합니다.", [["id", "string", true, "미확인 기록 ID"], ["routineId", "string", true, "루틴 ID"], ["scheduledAt", "string", true, "예정 시각"], ["status", "string", true, "DONE 또는 SKIPPED"]]),
  ];
}
