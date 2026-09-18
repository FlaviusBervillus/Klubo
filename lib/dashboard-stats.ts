import type { Category, Transaction, TransactionType } from "@/lib/mock-data"

/** Solde comptable = somme signée de toutes les transactions (entrées − sorties). */
export function computeAccountBalance(transactions: Transaction[]) {
  return transactions.reduce(
    (sum, tx) => sum + (tx.type === "entree" ? tx.amount : -tx.amount),
    0,
  )
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
    if (tx.type !== "sortie") continue
    if (tx.category === "Non catégorisé") continue
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount)
  }
  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount, key: category }))
    .sort((a, b) => b.amount - a.amount)
}

/** Tableau croisé catégorie × mois pour un sens donné (entrée/sortie), sur les N derniers mois. */
export function computeCategoryPivot(
  transactions: Transaction[],
  type: TransactionType,
  monthsCount = 6,
) {
  const now = new Date()
  const monthDates: Date[] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    monthDates.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
  }
  const months = monthDates.map((d) => MONTH_FORMATTER.format(d))
  const monthKeys = monthDates.map((d) => `${d.getFullYear()}-${d.getMonth()}`)

  const rowsByCategory = new Map<string, number[]>()
  for (const tx of transactions) {
    if (tx.type !== type || tx.category === "Non catégorisé") continue
    const d = new Date(tx.date)
    const idx = monthKeys.indexOf(`${d.getFullYear()}-${d.getMonth()}`)
    if (idx === -1) continue
    if (!rowsByCategory.has(tx.category)) {
      rowsByCategory.set(tx.category, new Array(monthsCount).fill(0))
    }
    rowsByCategory.get(tx.category)![idx] += tx.amount
  }

  const rows = Array.from(rowsByCategory.entries()).map(([category, values]) => ({
    category,
    values,
  }))
  return { months, rows }
}
