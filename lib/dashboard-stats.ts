import type { Category, Transaction, TransactionType } from "@/lib/mock-data"

/** Solde comptable = somme signée de toutes les transactions (entrées − sorties), frais Stripe déduits.
 * Les tentatives de paiement en échec/annulées (aucun argent réellement encaissé) sont exclues. */
export function computeAccountBalance(transactions: Transaction[]) {
  return transactions.reduce((sum, tx) => {
    if (tx.status === "echec") return sum
    const value = tx.stripe ? tx.stripe.net : tx.amount
    return sum + (tx.type === "entree" ? value : -value)
  }, 0)
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("fr-FR", { month: "short" })

/** Entrées/sorties des N derniers mois (mois calendaires), pour le graphique du dashboard. */
export function computeMonthlyFlow(transactions: Transaction[], monthsCount = 6) {
  const now = new Date()
  const buckets: { key: string; month: string; entrees: number; sorties: number }[] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: MONTH_FORMATTER.format(d),
      entrees: 0,
      sorties: 0,
    })
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))

  for (const tx of transactions) {
    if (tx.status === "echec") continue
    const d = new Date(tx.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const bucket = byKey.get(key)
    if (!bucket) continue
    if (tx.type === "entree") bucket.entrees += tx.amount
    else bucket.sorties += tx.amount
  }

  return buckets.map(({ month, entrees, sorties }) => ({ month, entrees, sorties }))
}

/** Répartition des dépenses (sorties) par catégorie, catégories non renseignées exclues. */
export function computeExpenseByCategory(transactions: Transaction[]) {
  const totals = new Map<Category, number>()
  for (const tx of transactions) {
    if (tx.type !== "sortie" || tx.status === "echec") continue
    if (tx.category === "Non catégorisé") continue
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount)
  }
  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount, key: category }))
    .sort((a, b) => b.amount - a.amount)
}

/** Mois calendaires des N derniers mois avant referenceDate (comportement historique, hors saison). */
export function buildRecentMonthBuckets(monthsCount = 6, referenceDate = new Date()) {
  const buckets: { key: string; month: string }[] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH_FORMATTER.format(d) })
  }
  return buckets
}

/** Mois calendaires couverts par une saison (de son début à sa fin, ou à aujourd'hui si elle est en cours). */
export function buildSeasonMonthBuckets(season: { startDate: string; endDate: string }) {
  const start = new Date(season.startDate)
  const today = new Date()
  const end = new Date(Math.min(new Date(season.endDate).getTime(), today.getTime()))
  const buckets: { key: string; month: string }[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor <= last) {
    buckets.push({ key: `${cursor.getFullYear()}-${cursor.getMonth()}`, month: MONTH_FORMATTER.format(cursor) })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return buckets.length > 0 ? buckets : buildRecentMonthBuckets(1)
}

/** Tableau croisé catégorie × mois pour un sens donné (entrée/sortie), sur les mois fournis. */
export function computeCategoryPivot(
  transactions: Transaction[],
  type: TransactionType,
  monthBuckets: { key: string; month: string }[],
) {
  const monthsCount = monthBuckets.length
  const months = monthBuckets.map((b) => b.month)
  const monthKeys = monthBuckets.map((b) => b.key)

  function monthIndex(date: string) {
    const d = new Date(date)
    return monthKeys.indexOf(`${d.getFullYear()}-${d.getMonth()}`)
  }

  function addTo(rowsByCategory: Map<string, number[]>, category: string, idx: number, amount: number) {
    if (!rowsByCategory.has(category)) {
      rowsByCategory.set(category, new Array(monthsCount).fill(0))
    }
    rowsByCategory.get(category)![idx] += amount
  }

  const rowsByCategory = new Map<string, number[]>()
  for (const tx of transactions) {
    if (tx.type !== type || tx.status === "echec") continue
    const idx = monthIndex(tx.date)
    if (idx === -1) continue
    // Recettes en montant brut (ce que l'adhérent a payé) : le frais Stripe est
    // comptabilisé séparément ci-dessous, pour ne pas le soustraire deux fois.
    addTo(rowsByCategory, tx.category, idx, tx.amount)
  }

  // Les frais Stripe n'ont pas leur propre transaction ("sortie") : on les rattache
  // ici à la catégorie "Frais bancaires" pour qu'ils apparaissent comme une charge à part entière.
  if (type === "sortie") {
    for (const tx of transactions) {
      if (tx.type !== "entree" || tx.status === "echec" || !tx.stripe?.fee) continue
      const idx = monthIndex(tx.date)
      if (idx === -1) continue
      addTo(rowsByCategory, "Frais bancaires", idx, tx.stripe.fee)
    }
  }

  const rows = Array.from(rowsByCategory.entries()).map(([category, values]) => ({
    category,
    values,
  }))
  return { months, rows }
}
