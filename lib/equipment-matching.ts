import type { EquipmentItem } from "@/lib/equipment-store"

export interface EquipmentAutoMatchResult {
  label: string
  remainingStock: number
  alreadyEmpty: boolean
}

/** Découpe en mots normalisés (accents/casse ignorés) — comparer mot à mot plutôt qu'en un seul
 * bloc concaténé, car la description insère souvent d'autres mots entre eux (ex. "Kimono TAILLE
 * 180" pour l'article "Kimono 180" : "kimono180" n'est substring de rien, mais chaque mot l'est). */
function words(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Un article "correspond" à la description si chacun de ses mots (ex. "kimono", "180") s'y
 * retrouve comme mot entier — jamais un simple sous-texte global, trop fragile dès qu'un autre mot
 * s'intercale (voir `words`). */
function labelMatchesDescription(label: string, descriptionWords: Set<string>): boolean {
  const labelWords = words(label)
  return labelWords.length > 0 && labelWords.every((w) => descriptionWords.has(w))
}

/** Retrouve l'équipement vendu : en priorité d'après la description de la transaction (ex. "Kimono
 * taille 180" contient tous les mots du libellé "Kimono 180"), car plusieurs tailles/articles
 * peuvent partager le même prix de vente — repli sur une correspondance exacte de prix si la
 * description ne mentionne aucun article connu. Ne devine jamais en cas d'ambiguïté (plusieurs
 * articles mentionnés dans la description, ou prix partagé par plusieurs articles). */
export function matchEquipmentSale(
  amount: number,
  items: EquipmentItem[],
  description?: string,
): EquipmentItem | null {
  if (description) {
    const descriptionWords = new Set(words(description))
    const byDescription = items.filter((item) => item.label && labelMatchesDescription(item.label, descriptionWords))
    if (byDescription.length === 1) return byDescription[0]
    if (byDescription.length > 1) {
      // Description ambiguë (plusieurs libellés s'y retrouvent, ex. un libellé sous-ensemble d'un
      // autre) : le plus spécifique (le plus de mots) l'emporte s'il est seul à ce niveau, sinon le
      // prix tranche s'il désigne sans équivoque un seul de ces articles.
      const maxWords = Math.max(...byDescription.map((item) => words(item.label).length))
      const mostSpecific = byDescription.filter((item) => words(item.label).length === maxWords)
      if (mostSpecific.length === 1) return mostSpecific[0]
      const byPriceAmongMatches = mostSpecific.filter((item) => Math.abs(item.salePrice - amount) < 0.01)
      if (byPriceAmongMatches.length === 1) return byPriceAmongMatches[0]
      return null
    }
  }

  const byPrice = items.filter((item) => Math.abs(item.salePrice - amount) < 0.01)
  return byPrice.length === 1 ? byPrice[0] : null
}

/** Décrémente le stock d'une unité quand une transaction "Équipements" correspond à un article du
 * catalogue (description ou prix). Ne descend jamais sous zéro. */
export async function applyEquipmentAutoMatch(
  amount: number,
  items: EquipmentItem[],
  updateItem: (id: string, patch: { stockQuantity: number }) => Promise<void>,
  description?: string,
): Promise<EquipmentAutoMatchResult | null> {
  const item = matchEquipmentSale(amount, items, description)
  if (!item) return null

  const alreadyEmpty = item.stockQuantity <= 0
  const remainingStock = Math.max(0, item.stockQuantity - 1)
  await updateItem(item.id, { stockQuantity: remainingStock })
  return { label: item.label, remainingStock, alreadyEmpty }
}
