import { z } from "zod";

// -------------------------------------------------------------
// 1. 공통 상수 및 Enums
// -------------------------------------------------------------
const UnitType = z.enum([
  "개",
  "알",
  "포",
  "g",
  "kg",
  "ml",
  "L",
  "장",
  "박스",
  "권",
]);
const ItemStatus = z.enum(["INBOX", "STORED", "CONSUMED", "DISCARDED"]);

// -------------------------------------------------------------
// 2. Base Schema (모든 아이템 공통)
// -------------------------------------------------------------
export const baseItemSchema = z.object({
  id: z.string().describe("고유 식별자"),
  name: z.string().describe("물품 이름"),
  quantity: z.number().min(0).describe("수량"),
  unit: UnitType.describe("단위"),
  sku: z.string().optional(),
  location: z.string().optional(),
  locationId: z.string().nullable(),
  status: ItemStatus.default("INBOX"),
  price: z.number().optional(),
  imageUrl: z.string().optional(),
  tags: z.array(z.string()).default([]),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sharedOwnerId: z.string().optional(),
  sharedByName: z.string().optional(),
  lastModifiedBy: z.string().optional(),
  lastModifiedByName: z.string().optional(),
  lastModifiedAt: z.string().optional(),
  expirationDate: z.string().optional(),
  purchaseDate: z.string().optional(),
});

// -------------------------------------------------------------
// 3. 도메인별 상세 스키마
// -------------------------------------------------------------

// 의류
export const clothesItemSchema = baseItemSchema.extend({
  domainType: z.literal("CLOTHES"),
  category: z.enum(["TOP", "BOTTOM", "OUTER", "UNDERWEAR", "ACC"]),
  season: z.array(z.enum(["SPRING", "SUMMER", "AUTUMN", "WINTER", "ALL"])),
  thickness: z.enum(["THIN", "NORMAL", "THICK"]),
  lastWornDate: z.string().nullable(),
  isDirty: z.boolean(),
  laundryCycleDays: z.number(),
  color: z.string().optional(),
});

// 약품
export const medicineItemSchema = baseItemSchema.extend({
  domainType: z.literal("MEDICINE"),
  type: z.enum(["ORAL", "EXTERNAL"]),
  form: z.enum(["TABLET", "CAPSULE", "LIQUID", "OINTMENT", "BANDAGE"]),
  efficacy: z.string(),
  sideEffects: z.array(z.string()),
  dosage: z.string(),
  expirationDate: z.string(), // 약품은 필수
});

// 식품
export const foodItemSchema = baseItemSchema.extend({
  domainType: z.literal("FOOD"),
  storageCondition: z.enum(["ROOM", "REFRIGERATED", "FROZEN"]),
  expirationDate: z.string(),
  isOpened: z.boolean(),
  openedDate: z.string().nullable(),
  category: z.enum(["INGREDIENT", "READY_MEAL", "BEVERAGE", "SNACK", "FRESH"]),
});

// 도서
export const bookItemSchema = baseItemSchema.extend({
  domainType: z.literal("BOOK"),
  author: z.string(),
  publisher: z.string().optional(),
  readingStatus: z.enum(["UNREAD", "READING", "FINISHED"]),
  rating: z.number().optional(),
  summary: z.string().optional(),
  tableOfContents: z.array(z.string()).optional(),
});

// 기타 (Household, Etc)
export const householdItemSchema = baseItemSchema.extend({
  domainType: z.literal("HOUSEHOLD"),
});

export const etcItemSchema = baseItemSchema.extend({
  domainType: z.literal("ETC"),
});

// -------------------------------------------------------------
// 4. 통합 유니온 스키마 (The Source of Truth)
// -------------------------------------------------------------
export const livingItemSchema = z.discriminatedUnion("domainType", [
  clothesItemSchema,
  medicineItemSchema,
  foodItemSchema,
  bookItemSchema,
  householdItemSchema,
  etcItemSchema,
]);

export function prepareLivingItemUpdate(
  target: Record<string, unknown>,
  updates: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const hasUpdate = (key: string) =>
    Object.prototype.hasOwnProperty.call(updates, key);
  const valueOrDefault = (
    key: string,
    fallback: unknown,
    allowed?: readonly unknown[],
  ) => {
    if (hasUpdate(key)) return updates[key];
    const current = target[key];
    return current !== undefined && (!allowed || allowed.includes(current))
      ? current
      : fallback;
  };
  const domainType = updates.domainType ?? target.domainType;
  const candidate: Record<string, unknown> = {
    ...target,
    ...updates,
    id: target.id,
    domainType,
    locationId: valueOrDefault("locationId", null),
    status: valueOrDefault(
      "status",
      "STORED",
      ["INBOX", "STORED", "CONSUMED", "DISCARDED"],
    ),
    tags: valueOrDefault("tags", []),
    createdAt: valueOrDefault("createdAt", now),
    updatedAt: now,
  };

  if (domainType === "FOOD") {
    Object.assign(candidate, {
      storageCondition: valueOrDefault(
        "storageCondition",
        "ROOM",
        ["ROOM", "REFRIGERATED", "FROZEN"],
      ),
      expirationDate: valueOrDefault("expirationDate", ""),
      isOpened: valueOrDefault("isOpened", false),
      openedDate: valueOrDefault("openedDate", null),
      category: valueOrDefault(
        "category",
        "INGREDIENT",
        ["INGREDIENT", "READY_MEAL", "BEVERAGE", "SNACK", "FRESH"],
      ),
    });
  } else if (domainType === "MEDICINE") {
    Object.assign(candidate, {
      type: valueOrDefault("type", "ORAL", ["ORAL", "EXTERNAL"]),
      form: valueOrDefault(
        "form",
        "TABLET",
        ["TABLET", "CAPSULE", "LIQUID", "OINTMENT", "BANDAGE"],
      ),
      efficacy: valueOrDefault("efficacy", ""),
      sideEffects: valueOrDefault("sideEffects", []),
      dosage: valueOrDefault("dosage", ""),
      expirationDate: valueOrDefault("expirationDate", ""),
    });
  } else if (domainType === "CLOTHES") {
    Object.assign(candidate, {
      category: valueOrDefault(
        "category",
        "TOP",
        ["TOP", "BOTTOM", "OUTER", "UNDERWEAR", "ACC"],
      ),
      season: valueOrDefault("season", ["ALL"]),
      thickness: valueOrDefault(
        "thickness",
        "NORMAL",
        ["THIN", "NORMAL", "THICK"],
      ),
      lastWornDate: valueOrDefault("lastWornDate", null),
      isDirty: valueOrDefault("isDirty", false),
      laundryCycleDays: valueOrDefault("laundryCycleDays", 7),
    });
  } else if (domainType === "BOOK") {
    Object.assign(candidate, {
      author: valueOrDefault("author", ""),
      readingStatus: valueOrDefault(
        "readingStatus",
        "UNREAD",
        ["UNREAD", "READING", "FINISHED"],
      ),
    });
  }

  return livingItemSchema.safeParse(candidate);
}

export const partialLivingItemSchema = z.discriminatedUnion("domainType", [
  clothesItemSchema.partial().required({ domainType: true, id: true }),
  medicineItemSchema.partial().required({ domainType: true, id: true }),
  foodItemSchema.partial().required({ domainType: true, id: true }),
  bookItemSchema.partial().required({ domainType: true, id: true }),
  householdItemSchema.partial().required({ domainType: true, id: true }),
  etcItemSchema.partial().required({ domainType: true, id: true }),
]);

export const positionSchema = z.object({
  id: z.string().describe("고유 위치 SKU (예: LOC-FRIDGE-01)"),
  name: z.string().describe("위치 이름 (예: 메인 냉장고, 냉동실 1칸)"),
  // 🚀 [핵심]: 이 공간을 품고 있는 더 큰 공간의 SKU. 최상위 공간(방 자체 등)이면 null
  parentId: z.string().nullable().describe("상위 공간의 SKU"),
  description: z.string().optional(),
});

export type PositionItem = z.infer<typeof positionSchema>;
export type LivingItem = z.infer<typeof livingItemSchema>;
export type FoodItem = z.infer<typeof foodItemSchema>;
export type ClothesItem = z.infer<typeof clothesItemSchema>;
export type MedicineItem =  z.infer<typeof medicineItemSchema>;
export type InventoryItem = LivingItem;
export type LivingItemPayload = z.infer<typeof livingItemSchema>;
