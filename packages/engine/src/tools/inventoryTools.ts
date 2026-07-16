// 📂 packages/engine/src/tools/inventoryTools.ts

import { tool } from "ai";
import { z } from "zod";
import { AgentToolContext } from "./types";

export function createInventoryTools(ctx: AgentToolContext) {
  return {
    list: tool({
      description: "현재 장부에 등록된 모든 물품 목록을 조회합니다.",
      parameters: z.object({}),
      // @ts-ignore
      execute: async () => {
        ctx.checkAbort();
        return ctx.getInventory();
      }
    }),
    
    add: tool({
      description: "새로운 물품을 장부에 추가합니다. 필수 규격을 지켜주세요.",
      parameters: z.object({
        name: z.string().describe("물품 이름"),
        quantity: z.number().optional().default(1),
        unit: z.string().optional().default("개"),
        domainType: z.enum(["CLOTHES", "MEDICINE", "FOOD", "BOOK", "HOUSEHOLD", "ETC"]).optional().default("ETC"),
        positionSku: z.string().optional().describe("물건을 보관한 공간의 고유 SKU (예: LOC-FR-01)"),
      }).passthrough(),
      // @ts-ignore
      execute: async (req: Record<string, any>) => {
        ctx.checkAbort();
        const validDomain = req.domainType || "ETC";
        const cleanItem: Record<string, any> = {
          ...req,
          id: req.id ? String(req.id) : `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          quantity: Number(req.quantity) || 1,
          unit: req.unit || "개",
          name: req.name || "이름 없는 물품",
          domainType: validDomain,
          status: req.status || "STORED",
          positionSku: req.positionSku || "unknown",
        };

        // 스키마 필수값 방어
        if (validDomain === "FOOD") {
          cleanItem.storageCondition = cleanItem.storageCondition || "ROOM";
          cleanItem.expirationDate = cleanItem.expirationDate || "2025-12-31";
          cleanItem.isOpened = cleanItem.isOpened || false;
          cleanItem.openedDate = cleanItem.openedDate || null;
          cleanItem.category = cleanItem.category || "INGREDIENT";
        } else if (validDomain === "MEDICINE") {
          cleanItem.type = cleanItem.type || "ORAL";
          cleanItem.form = cleanItem.form || "TABLET";
          cleanItem.efficacy = cleanItem.efficacy || "일반";
          cleanItem.sideEffects = cleanItem.sideEffects || [];
          cleanItem.dosage = cleanItem.dosage || "1일 1회";
          cleanItem.expirationDate = cleanItem.expirationDate || "2025-12-31";
        } else if (validDomain === "CLOTHES") {
          cleanItem.category = cleanItem.category || "TOP";
          cleanItem.season = cleanItem.season || ["ALL"];
          cleanItem.thickness = cleanItem.thickness || "NORMAL";
          cleanItem.isDirty = cleanItem.isDirty || false;
          cleanItem.laundryCycleDays = cleanItem.laundryCycleDays || 7;
        } else if (validDomain === "BOOK") {
          cleanItem.author = cleanItem.author || "미상";
          cleanItem.readingStatus = cleanItem.readingStatus || "UNREAD";
        }

        const list = ctx.getInventory();
        list.push(cleanItem as any);
        ctx.setInventory(list);
        ctx.log(`🛠️ [Add] 성공: "${cleanItem.name}"`);

        return { status: "success", id: cleanItem.id, item: cleanItem };
      }
    }),

    update: tool({
      description: "장부의 기존 물품 데이터를 수정합니다.",
      parameters: z.object({
        id: z.string().describe("대상 물품의 고유 ID"),
        updates: z.any().describe("수정할 데이터 객체 (예: { positionSku: 'LOC-FR-02' })")
      }),
      // @ts-ignore
      execute: async ({ id, updates }: {id:string, updates: Record<string, any>}) => {
        ctx.checkAbort();
        const list = ctx.getInventory();
        const idx = list.findIndex((i: any) => i.id === id || i.name === id);
        if (idx === -1) return { status: "error", message: `물품 '${id}'을 찾을 수 없습니다.` };

        list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() } as any;
        ctx.setInventory(list);
        ctx.log(`🛠️ [Update] 성공: ${list[idx].name}`);
        return { status: "success", id: list[idx].id, updates };
      }
    }),

    delete: tool({
      description: "물품을 영구 파기합니다.",
      parameters: z.object({
        id: z.string().describe("삭제할 물품의 고유 ID")
      }),
      // @ts-ignore
      execute: async ({ id } : {id:string}) => {
        ctx.checkAbort();
        let list = ctx.getInventory();
        const idx = list.findIndex((i: any) => i.id === id || i.name === id);
        if (idx === -1) return { status: "error", message: `물품 '${id}'을 찾을 수 없습니다.` };

        const targetId = list[idx].id;
        list = list.filter((i: any) => i.id !== targetId);
        ctx.setInventory(list);
        ctx.log(`🛠️ [Delete] 성공: ID ${targetId} 파기.`);
        return { status: "success", id: targetId };
      }
    }),

    batchAdd: tool({
      description: "여러 물품을 동시에 장부에 등록합니다.",
      parameters: z.object({
        // @ts-ignore
        items: z.array(z.any(z.unknown())).describe("추가할 물품 객체 배열 (각 객체에 positionSku 포함 권장)")
      }),
      // @ts-ignore
      execute: async ({ items }) => {
        ctx.checkAbort();
        const list = ctx.getInventory();
        // @ts-ignore
        const newItems = items.map(({req}) => {
          const validDomain = req.domainType || "ETC";
          const cleanItem: Record<string, any> = {
            ...req,
            id: req.id ? String(req.id) : `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            quantity: Number(req.quantity) || 1,
            unit: req.unit || "개",
            name: req.name || "이름 없는 물품",
            domainType: ["CLOTHES", "MEDICINE", "FOOD", "BOOK", "HOUSEHOLD", "ETC"].includes(String(validDomain)) ? validDomain : "ETC",
            status: req.status || "STORED",
            positionSku: req.positionSku || "unknown",
          };
          return cleanItem;
        });

        list.push(...newItems as any[]);
        ctx.setInventory(list);
        ctx.log(`🛠️ [Batch Add] 성공: 총 ${newItems.length}개 일괄 적재 완료.`);
        return { status: "success", count: newItems.length };
      }
    }),

    batchUpdate: tool({
      description: "여러 물품의 데이터를 일괄 수정합니다.",
      parameters: z.object({
        updatesList: z.array(
          z.object({
            id: z.string(),
            updates: z.any()
          })
        ).describe("수정할 물품 ID와 변경값 객체 배열")
      }),
      // @ts-ignore
      execute: async ({ updatesList } : {updatesList: Array<{id: string, updates: Record<string, any>}>}) => {
        ctx.checkAbort();
        const list = ctx.getInventory();
        let updateCount = 0;

        updatesList.forEach(req => {
          const idx = list.findIndex((i: any) => i.id === req.id || i.name === req.id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...req.updates, updatedAt: new Date().toISOString() } as any;
            updateCount++;
          }
        });

        ctx.setInventory(list);
        ctx.log(`🛠️ [Batch Update] 성공: 총 ${updateCount}개 일괄 수정 완료.`);
        return { status: "success", count: updateCount };
      }
    })
  };
}