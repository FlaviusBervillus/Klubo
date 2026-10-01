export interface FixedAsset {
  id: string
  label: string
  purchaseAmount: number
  purchaseDate: string
  depreciationYears: number
  disposed: boolean
  notes: string
}

/** Nombre de mois complets entre deux dates (>= 0) — base d'un amortissement linéaire mensuel. */
function monthsBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(0, months)
}

/** Amortissement linéaire mensuel (prorata temporis) : valeur nette comptable d'une immobilisation
 * à une date donnée. Un bien cédé ("disposed") est considéré comme totalement sorti du bilan. */
export function computeAssetDepreciation(asset: FixedAsset, asOfDate: Date) {
  if (asset.disposed) {
    return { accumulatedDepreciation: asset.purchaseAmount, netBookValue: 0, monthlyRate: 0, fullyDepreciated: true }
  }
  const totalMonths = Math.max(1, asset.depreciationYears * 12)
  const monthlyRate = asset.purchaseAmount / totalMonths
  const purchaseDate = new Date(asset.purchaseDate)
  const elapsedMonths = Math.min(monthsBetween(purchaseDate, asOfDate), totalMonths)
  const accumulatedDepreciation = monthlyRate * elapsedMonths
  return {
    accumulatedDepreciation,
    netBookValue: asset.purchaseAmount - accumulatedDepreciation,
    monthlyRate,
    fullyDepreciated: elapsedMonths >= totalMonths,
  }
}

/** Dotation aux amortissements imputable à une période (ex. une saison) : l'écart entre
 * l'amortissement cumulé en fin et en début de période — nul si le bien n'était pas encore
 * acquis, ou déjà totalement amorti, sur tout ou partie de la période. */
export function computePeriodDotation(asset: FixedAsset, periodStart: Date, periodEnd: Date) {
  const atStart = computeAssetDepreciation(asset, periodStart).accumulatedDepreciation
  const atEnd = computeAssetDepreciation(asset, periodEnd).accumulatedDepreciation
  return Math.max(0, atEnd - atStart)
}

export function sumNetBookValue(assets: FixedAsset[], asOfDate: Date) {
  return assets.reduce((sum, a) => sum + computeAssetDepreciation(a, asOfDate).netBookValue, 0)
}

export function sumPeriodDotation(assets: FixedAsset[], periodStart: Date, periodEnd: Date) {
  return assets.reduce((sum, a) => sum + computePeriodDotation(a, periodStart, periodEnd), 0)
}
