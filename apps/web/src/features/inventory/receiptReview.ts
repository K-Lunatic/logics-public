import type {
  ReceiptCommitInput,
  ReceiptPreview,
} from "@ink/assembler";

export type SelectableReceiptItem = ReceiptPreview["items"][number] & {
  selected: boolean;
};

export function toReceiptCommitInput(
  includeFinance: boolean,
  finance: ReceiptPreview["finance"],
  items: SelectableReceiptItem[],
): ReceiptCommitInput {
  return {
    finance: includeFinance && finance
      ? {
          amount: finance.amount,
          category: finance.category,
          assetAccount: finance.assetAccount,
          description: finance.description,
          date: finance.date,
        }
      : null,
    items: items
      .filter((item) => item.selected)
      .map((item) => ({
        name: item.name,
        domainType: item.domainType,
        quantity: item.quantity,
        unit: item.unit,
        expirationDate: item.expirationDate,
        barcode: item.barcode,
      })),
  };
}
