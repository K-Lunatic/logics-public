// 📂 packages/types/src/storage.ts
import { InventoryItem } from "./inventory";

export interface IStorageAdapter {
  saveItem(userId: string, item: InventoryItem): Promise<void>;
  getItem(userId: string, itemId: string): Promise<InventoryItem | null>;
  deleteItem(userId: string, itemId: string): Promise<void>;
  getInventory(userId: string): Promise<InventoryItem[]>;
}
