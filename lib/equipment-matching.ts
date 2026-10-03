import type { EquipmentItem } from "@/lib/equipment-store"

export interface EquipmentAutoMatchResult {
  label: string
  remainingStock: number
  alreadyEmpty: boolean
}

/** Retrouve l'équipement vendu d'après le montant payé, uniquement sur une correspondance exacte
 * avec son prix de vente (comme pour les cotisations : on ne devine jamais si le montant ne colle
 * à aucun article connu). */
export function matchEquipmentSale(amount: number, items: EquipmentItem[]): EquipmentItem | null {
  return items.find((item) => Math.abs(item.salePrice - amount) < 0.01) ?? null
}

/** Décrémente le stock d'une unité quand une transaction "Équipements" correspond exactement au
 * prix de vente d'un article du catalogue. Ne descend jamais sous zéro. */
export async function applyEquipmentAutoMatch(
  amount: number,
  items: EquipmentItem[],
  updateItem: (id: string, patch: { stockQuantity: number }) => Promise<void>,
): Promise<EquipmentAutoMatchResult | null> {
  const item = matchEquipmentSale(amount, items)
  if (!item) return null

  const alreadyEmpty = item.stockQuantity <= 0
  const remainingStock = Math.max(0, item.stockQuantity - 1)
  await updateItem(item.id, { stockQuantity: remainingStock })
  return { label: item.label, remainingStock, alreadyEmpty }
}
