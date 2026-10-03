import {
  computeCaisseBanque,
  computeCategoryTotals,
  computeReportANouveau,
  computeResultExercice,
} from "@/lib/dashboard-stats"
import type { FixedAsset } from "@/lib/depreciation"
import { sumNetBookValue, sumPeriodDotation } from "@/lib/depreciation"
import type { Transaction } from "@/lib/mock-data"
import type { Season } from "@/lib/seasons-store"

export interface CategoryLine {
  category: string
  amount: number
}

export interface ExerciceSummary {
  periodLabel: string
  periodEnd: Date
  produits: number
  chargesCourantes: number
  dotation: number
  charges: number
  resultat: number
  reportANouveau: number
  caisse: number
  banque: number
  disponibilites: number
  immobilisationsNettes: number
  totalActif: number
  produitsParCategorie: CategoryLine[]
  chargesParCategorie: CategoryLine[]
}

/** Transactions de l'exercice (saison) données, et celles cumulées jusqu'à sa fin — les deux
 * bases dont dépendent tous les calculs d'un exercice comptable. */
function transactionsForSeason(allTransactions: Transaction[], season: Season | null) {
  if (!season) {
    return { ofPeriod: allTransactions, upToPeriodEnd: allTransactions }
  }
  const start = season.startDate
  const end = season.endDate
  function localDateStr(iso: string) {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  return {
    ofPeriod: allTransactions.filter((tx) => {
      const d = localDateStr(tx.date)
      return d >= start && d <= end
    }),
    upToPeriodEnd: allTransactions.filter((tx) => localDateStr(tx.date) <= end),
  }
}

/** Calcule compte de résultat + bilan pour UN exercice (saison) donné — réutilisé pour l'exercice
 * en cours (N) et le précédent (N-1), afin d'afficher les deux colonnes comme le fait un vrai
 * rapport comptable. Les dettes ne sont pas incluses ici : on n'a pas d'historique de leur statut
 * (réglée ou non) à une date passée, seulement leur état actuel. */
export function computeExerciceSummary(
  season: Season | null,
  allTransactions: Transaction[],
  assets: FixedAsset[],
): ExerciceSummary {
  const periodEnd = season ? new Date(season.endDate) : new Date()
  const periodStart = season ? new Date(season.startDate) : new Date(0)
  const { ofPeriod, upToPeriodEnd } = transactionsForSeason(allTransactions, season)

  const activeAssets = assets.filter((a) => !a.disposed)
  const dotation = sumPeriodDotation(activeAssets, periodStart, periodEnd)
  const immobilisationsNettes = sumNetBookValue(activeAssets, periodEnd)

  const { produits, charges: chargesCourantes } = computeResultExercice(ofPeriod)
  const charges = chargesCourantes + dotation
  const resultat = produits - charges

  const reportANouveau = season ? computeReportANouveau(allTransactions, season.startDate) : 0
  const { caisse, banque } = computeCaisseBanque(upToPeriodEnd)
  const disponibilites = caisse + banque

  return {
    periodLabel: season?.label ?? "",
    periodEnd,
    produits,
    chargesCourantes,
    dotation,
    charges,
    resultat,
    reportANouveau,
    caisse,
    banque,
    disponibilites,
    immobilisationsNettes,
    totalActif: disponibilites + immobilisationsNettes,
    produitsParCategorie: computeCategoryTotals(ofPeriod, "entree"),
    chargesParCategorie: computeCategoryTotals(ofPeriod, "sortie"),
  }
}

/** La saison immédiatement antérieure à celle donnée (les saisons sont triées par date de début
 * décroissante) — pour la colonne de comparaison N-1, comme dans un vrai rapport comptable. */
export function findPriorSeason(seasons: Season[], activeSeason: Season | null): Season | null {
  if (!activeSeason) return null
  const index = seasons.findIndex((s) => s.id === activeSeason.id)
  if (index === -1) return null
  return seasons[index + 1] ?? null
}
