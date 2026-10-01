"use client"

import { useEffect, useMemo, useState } from "react"
import { InfoIcon, PrinterIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  computeCaisseBanque,
  computeCategoryTotals,
  computeReportANouveau,
  computeResultExercice,
} from "@/lib/dashboard-stats"
import { sumNetBookValue, sumPeriodDotation } from "@/lib/depreciation"
import { useDebtsStore } from "@/lib/debts-store"
import { useFixedAssetsStore } from "@/lib/fixed-assets-store"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro, type Category } from "@/lib/mock-data"
import { useSeasons, useSeasonTransactions } from "@/lib/seasons-store"
import { useTransactionsStore } from "@/lib/transactions-store"
import { ManageDebtsDialog } from "@/components/rapports/manage-debts-dialog"
import { ManageFixedAssetsDialog } from "@/components/rapports/manage-fixed-assets-dialog"

interface GocardlessAccountBalance {
  accountId: string
  label: string
  amount: number
  currency: string
}

function Line({
  label,
  value,
  bold = false,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2 ${bold ? "" : "border-b border-dashed"}`}>
      <span className="text-sm">{label}</span>
      <span className={`font-mono tabular-nums ${bold ? "text-base font-semibold" : "text-sm"}`}>
        {value}
      </span>
    </div>
  )
}

export function AccountingReport() {
  const { t } = useTranslation()
  const { activeSeason } = useSeasons()
  const seasonTransactions = useSeasonTransactions()
  const { transactions: allTransactions } = useTransactionsStore()
  const { assets } = useFixedAssetsStore()
  const { debts } = useDebtsStore()
  const [gocardlessAccounts, setGocardlessAccounts] = useState<GocardlessAccountBalance[] | null>(null)

  useEffect(() => {
    const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined
    if (!electronApi) return
    electronApi.db.getSettings().then((settings) => {
      const raw = settings.gocardlessBalances
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as { accounts: GocardlessAccountBalance[] }
        setGocardlessAccounts(parsed.accounts || [])
      } catch {
        setGocardlessAccounts(null)
      }
    })
  }, [])

  const periodEnd = activeSeason ? new Date(activeSeason.endDate) : new Date()
  const periodStart = activeSeason ? new Date(activeSeason.startDate) : new Date(0)

  const activeAssets = useMemo(() => assets.filter((a) => !a.disposed), [assets])
  const dotationPeriode = useMemo(
    () => sumPeriodDotation(activeAssets, periodStart, periodEnd),
    [activeAssets, periodStart, periodEnd],
  )
  const immobilisationsNettes = useMemo(
    () => sumNetBookValue(activeAssets, periodEnd),
    [activeAssets, periodEnd],
  )
  const totalDettes = useMemo(
    () => debts.filter((d) => !d.settled).reduce((sum, d) => sum + d.amount, 0),
    [debts],
  )

  const { produits, charges: chargesCourantes } = useMemo(
    () => computeResultExercice(seasonTransactions),
    [seasonTransactions],
  )
  const charges = chargesCourantes + dotationPeriode
  const resultat = produits - charges

  const produitsParCategorie = useMemo(
    () => computeCategoryTotals(seasonTransactions, "entree"),
    [seasonTransactions],
  )
  const chargesParCategorie = useMemo(
    () => computeCategoryTotals(seasonTransactions, "sortie"),
    [seasonTransactions],
  )

  const reportANouveau = useMemo(() => {
    if (!activeSeason) return 0
    return computeReportANouveau(allTransactions, activeSeason.startDate)
  }, [allTransactions, activeSeason])

  const { caisse, banque: banqueEstimee } = useMemo(() => {
    const cumulated = activeSeason
      ? allTransactions.filter((tx) => new Date(tx.date) <= periodEnd)
      : allTransactions
    return computeCaisseBanque(cumulated)
  }, [allTransactions, activeSeason, periodEnd])

  // Une fois GoCardless configuré, on préfère le solde bancaire réel (par compte, ex. Livret A)
  // à l'estimation calculée depuis les transactions enregistrées manuellement.
  const banque = gocardlessAccounts
    ? gocardlessAccounts.reduce((sum, a) => sum + a.amount, 0)
    : banqueEstimee

  const disponibilites = caisse + banque
  const totalActif = disponibilites + immobilisationsNettes
  const totalPassif = totalDettes + reportANouveau + resultat
  const ecart = totalActif - totalPassif
  const balanced = Math.abs(ecart) < 0.01

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Alert className="flex-1">
          <InfoIcon />
          <AlertTitle>{t.accounting.periodLabel}</AlertTitle>
          <AlertDescription>{t.accounting.disclaimer}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <PrinterIcon data-icon="inline-start" />
          {t.accounting.print}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t.accounting.periodLabel} :{" "}
          <span className="font-medium text-foreground">{activeSeason?.label ?? t.seasons.allTime}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <ManageFixedAssetsDialog />
          <ManageDebtsDialog />
        </div>
      </div>

      {/* Compte de résultat */}
      <Card>
        <CardHeader>
          <CardTitle>{t.accounting.compteResultatTitle}</CardTitle>
          <CardDescription>{t.accounting.compteResultatSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Line label={t.accounting.totalProduits} value={formatEuro(produits)} />
          <Line label={t.accounting.totalCharges} value={`− ${formatEuro(charges)}`} />
          {dotationPeriode > 0 ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {t.accounting.dotationIncluded.replace("{amount}", formatEuro(dotationPeriode))}
            </p>
          ) : null}
          <Line
            label={t.accounting.resultatExercice}
            value={formatEuro(resultat, { signed: true })}
            bold
          />
          <p className="pt-2 text-xs text-muted-foreground">
            {resultat >= 0 ? t.reports.netResultPositive : t.reports.netResultNegative}
          </p>
        </CardContent>
      </Card>

      {/* Compte de résultat détaillé */}
      <Card>
        <CardHeader>
          <CardTitle>{t.accounting.compteResultatDetailTitle}</CardTitle>
          <CardDescription>{t.accounting.compteResultatDetailSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.produits}
            </h4>
            {produitsParCategorie.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.accounting.noCategoryData}</p>
            ) : (
              <Table>
                <TableBody>
                  {produitsParCategorie.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell>{t.categories[row.category as Category] ?? row.category}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatEuro(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>{t.accounting.totalProduits}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatEuro(produits)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.charges}
            </h4>
            {chargesParCategorie.length === 0 && dotationPeriode === 0 ? (
              <p className="text-sm text-muted-foreground">{t.accounting.noCategoryData}</p>
            ) : (
              <Table>
                <TableBody>
                  {chargesParCategorie.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell>{t.categories[row.category as Category] ?? row.category}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatEuro(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {dotationPeriode > 0 ? (
                    <TableRow>
                      <TableCell>{t.accounting.dotationLabel}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatEuro(dotationPeriode)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow className="font-semibold">
                    <TableCell>{t.accounting.totalCharges}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatEuro(charges)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bilan actif / passif */}
      <Card>
        <CardHeader>
          <CardTitle>{t.accounting.bilanTitle}</CardTitle>
          <CardDescription>{t.accounting.bilanSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.actif}
            </h4>
            <Line label={t.accounting.disponibilites} value={formatEuro(disponibilites)} />
            <Line label={t.accounting.immobilisationsNettes} value={formatEuro(immobilisationsNettes)} />
            <Line label={t.accounting.totalActif} value={formatEuro(totalActif)} bold />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.passif}
            </h4>
            <Line label={t.accounting.dettes} value={formatEuro(totalDettes)} />
            <Line label={t.accounting.reportANouveau} value={formatEuro(reportANouveau, { signed: true })} />
            <Line label={t.accounting.resultatExerciceLine} value={formatEuro(resultat, { signed: true })} />
            <Line label={t.accounting.totalPassif} value={formatEuro(totalPassif)} bold />
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <Separator className="mb-3" />
          {balanced ? (
            <p className="text-xs text-success dark:text-[oklch(0.74_0.14_155)]">✓ {t.accounting.balanceOk}</p>
          ) : (
            <p className="text-xs text-[oklch(0.55_0.15_60)] dark:text-[oklch(0.8_0.14_65)]">
              {t.accounting.balanceGap.replace("{amount}", formatEuro(ecart, { signed: true }))}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bilan détaillé */}
      <Card>
        <CardHeader>
          <CardTitle>{t.accounting.bilanDetailTitle}</CardTitle>
          <CardDescription>{t.accounting.bilanDetailSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.actif}
            </h4>
            <Line label={t.accounting.caisse} value={formatEuro(caisse)} />
            {gocardlessAccounts && gocardlessAccounts.length > 0 ? (
              <>
                {gocardlessAccounts.map((acc) => (
                  <Line key={acc.accountId} label={acc.label} value={formatEuro(acc.amount)} />
                ))}
                <Badge variant="outline" className="mt-1 w-fit text-[10px] text-muted-foreground">
                  {t.accounting.bankLive}
                </Badge>
              </>
            ) : (
              <>
                <Line label={t.accounting.banque} value={formatEuro(banque)} />
                <p className="pt-1 text-xs text-muted-foreground">{t.accounting.bankEstimated}</p>
              </>
            )}
            {activeAssets.length > 0 ? (
              <>
                <Separator className="my-2" />
                {activeAssets.map((asset) => (
                  <Line
                    key={asset.id}
                    label={asset.label}
                    value={formatEuro(sumNetBookValue([asset], periodEnd))}
                  />
                ))}
              </>
            ) : null}
            <Line label={t.accounting.totalActif} value={formatEuro(totalActif)} bold />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.passif}
            </h4>
            {debts.filter((d) => !d.settled).length > 0 ? (
              debts
                .filter((d) => !d.settled)
                .map((debt) => <Line key={debt.id} label={debt.label} value={formatEuro(debt.amount)} />)
            ) : (
              <Line label={t.accounting.dettes} value={formatEuro(0)} />
            )}
            <Separator className="my-2" />
            <Line label={t.accounting.reportANouveau} value={formatEuro(reportANouveau, { signed: true })} />
            <Line label={t.accounting.resultatExerciceLine} value={formatEuro(resultat, { signed: true })} />
            <Line label={t.accounting.totalPassif} value={formatEuro(totalPassif)} bold />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
