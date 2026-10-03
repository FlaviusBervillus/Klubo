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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { computeExerciceSummary, findPriorSeason, type ExerciceSummary } from "@/lib/accounting-summary"
import { sumNetBookValue } from "@/lib/depreciation"
import { useDebtsStore } from "@/lib/debts-store"
import { useFixedAssetsStore } from "@/lib/fixed-assets-store"
import { useTranslation } from "@/lib/i18n/context"
import { useClubSettings } from "@/lib/club-settings"
import { formatEuro, type Category } from "@/lib/mock-data"
import { useSeasons } from "@/lib/seasons-store"
import { useTransactionsStore } from "@/lib/transactions-store"
import { ManageDebtsDialog } from "@/components/rapports/manage-debts-dialog"
import { ManageFixedAssetsDialog } from "@/components/rapports/manage-fixed-assets-dialog"

interface GocardlessAccountBalance {
  accountId: string
  label: string
  amount: number
  currency: string
}

interface LedgerRow {
  label: string
  n?: number | null
  n1?: number | null
  variant?: "section" | "item" | "subtotal" | "total"
  signed?: boolean
}

function formatCell(value: number | null | undefined, signed?: boolean) {
  if (value == null) return "—"
  if (value === 0) return "—"
  return formatEuro(value, signed ? { signed: true } : undefined)
}

function LedgerTable({
  rows,
  nLabel,
  n1Label,
}: {
  rows: LedgerRow[]
  nLabel: string
  n1Label?: string
}) {
  const colSpan = n1Label ? 3 : 2
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead>Postes</TableHead>
          <TableHead className="text-right">{nLabel}</TableHead>
          {n1Label ? <TableHead className="text-right">{n1Label}</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          if (row.variant === "section") {
            return (
              <TableRow key={i} className="hover:bg-transparent">
                <TableCell
                  colSpan={colSpan}
                  className="pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {row.label}
                </TableCell>
              </TableRow>
            )
          }
          const isTotal = row.variant === "total"
          const isSubtotal = row.variant === "subtotal"
          return (
            <TableRow
              key={i}
              className={
                isTotal
                  ? "bg-destructive/10 font-semibold"
                  : isSubtotal
                    ? "bg-muted/40 font-medium"
                    : ""
              }
            >
              <TableCell className={isSubtotal || isTotal ? "" : "pl-4 text-muted-foreground"}>
                {row.label}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatCell(row.n, row.signed)}
              </TableCell>
              {n1Label ? (
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatCell(row.n1, row.signed)}
                </TableCell>
              ) : null}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function AccountingReport() {
  const { t } = useTranslation()
  const { settings } = useClubSettings()
  const { seasons, activeSeason } = useSeasons()
  const { transactions: allTransactions } = useTransactionsStore()
  const { assets } = useFixedAssetsStore()
  const { debts } = useDebtsStore()
  const [gocardlessAccounts, setGocardlessAccounts] = useState<GocardlessAccountBalance[] | null>(null)

  useEffect(() => {
    const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined
    if (!electronApi) return
    electronApi.db.getSettings().then((settingsRow) => {
      const raw = settingsRow.gocardlessBalances
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as { accounts: GocardlessAccountBalance[] }
        setGocardlessAccounts(parsed.accounts || [])
      } catch {
        setGocardlessAccounts(null)
      }
    })
  }, [])

  const priorSeason = useMemo(() => findPriorSeason(seasons, activeSeason), [seasons, activeSeason])

  const current = useMemo(
    () => computeExerciceSummary(activeSeason, allTransactions, assets),
    [activeSeason, allTransactions, assets],
  )
  const prior: ExerciceSummary | null = useMemo(
    () => (priorSeason ? computeExerciceSummary(priorSeason, allTransactions, assets) : null),
    [priorSeason, allTransactions, assets],
  )

  const activeAssets = useMemo(() => assets.filter((a) => !a.disposed), [assets])
  const unsettledDebts = useMemo(() => debts.filter((d) => !d.settled), [debts])
  const totalDettes = unsettledDebts.reduce((sum, d) => sum + d.amount, 0)

  // Une fois GoCardless configuré, on préfère le solde bancaire réel (par compte, ex. Livret A) à
  // l'estimation calculée depuis les transactions enregistrées manuellement — mais uniquement pour
  // l'exercice en cours : on n'a pas de solde bancaire réel historisé pour un exercice passé.
  const banqueReelle = gocardlessAccounts ? gocardlessAccounts.reduce((sum, a) => sum + a.amount, 0) : null
  const disponibilitesActif = banqueReelle != null ? current.caisse + banqueReelle : current.disponibilites
  const totalActif = disponibilitesActif + current.immobilisationsNettes
  const totalActifN1 = prior ? prior.totalActif : null

  const totalCapitauxPropres = current.reportANouveau + current.resultat
  const totalCapitauxPropresN1 = prior ? prior.reportANouveau + prior.resultat : null
  const totalPassif = totalCapitauxPropres + totalDettes
  const totalPassifN1 = prior ? totalCapitauxPropresN1! : null // dettes non historisées par exercice (voir note)

  const ecart = totalActif - totalPassif
  const balanced = Math.abs(ecart) < 0.01

  const nLabel = activeSeason?.label ?? t.seasons.allTime
  const n1Label = prior?.periodLabel

  function fmtVar(n: number, n1: number | null) {
    if (n1 == null || n1 === 0) return "—"
    const diff = n - n1
    const pct = (diff / Math.abs(n1)) * 100
    return `${formatEuro(diff, { signed: true })} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`
  }

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
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

      <div className="hidden flex-col gap-0.5 border-b pb-3 print:flex">
        <h1 className="text-xl font-semibold">{settings.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t.accounting.compteResultatTitle} / {t.accounting.bilanTitle} — {t.accounting.periodLabel} :{" "}
          {activeSeason?.label ?? t.seasons.allTime}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          {t.accounting.periodLabel} : <span className="font-medium text-foreground">{nLabel}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <ManageFixedAssetsDialog />
          <ManageDebtsDialog />
        </div>
      </div>

      {/* Compte de résultat */}
      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>{t.accounting.compteResultatTitle}</CardTitle>
          <CardDescription>{t.accounting.compteResultatSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <LedgerTable
            nLabel={nLabel}
            n1Label={n1Label}
            rows={[
              { label: t.accounting.produitsExploitationSection, variant: "section" },
              {
                label: t.accounting.produitsLine,
                n: current.produits,
                n1: prior?.produits,
              },
              {
                label: t.accounting.totalProduitsExploitation,
                n: current.produits,
                n1: prior?.produits,
                variant: "subtotal",
              },
              { label: t.accounting.chargesExploitationSection, variant: "section" },
              {
                label: t.accounting.achatsChargesExternes,
                n: current.chargesCourantes,
                n1: prior?.chargesCourantes,
              },
              {
                label: t.accounting.dotationLabel,
                n: current.dotation,
                n1: prior?.dotation,
              },
              {
                label: t.accounting.totalChargesExploitation,
                n: current.charges,
                n1: prior?.charges,
                variant: "subtotal",
              },
              {
                label: t.accounting.resultatExploitation,
                n: current.resultat,
                n1: prior?.resultat,
                variant: "subtotal",
                signed: true,
              },
              {
                label: t.accounting.resultatExerciceLine,
                n: current.resultat,
                n1: prior?.resultat,
                variant: "total",
                signed: true,
              },
            ]}
          />
          <p className="px-4 py-3 text-xs text-muted-foreground">
            {current.resultat >= 0 ? t.reports.netResultPositive : t.reports.netResultNegative}
          </p>
        </CardContent>
      </Card>

      {/* Compte de résultat détaillé */}
      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>{t.accounting.compteResultatDetailTitle}</CardTitle>
          <CardDescription>{t.accounting.compteResultatDetailSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Postes</TableHead>
                <TableHead className="text-right">{nLabel}</TableHead>
                {n1Label ? <TableHead className="text-right">{n1Label}</TableHead> : null}
                {n1Label ? <TableHead className="text-right">Var.</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={n1Label ? 4 : 2}
                  className="pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {t.accounting.produitsExploitationSection}
                </TableCell>
              </TableRow>
              {current.produitsParCategorie.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={n1Label ? 4 : 2} className="text-sm text-muted-foreground">
                    {t.accounting.noCategoryData}
                  </TableCell>
                </TableRow>
              ) : (
                current.produitsParCategorie.map((row) => {
                  const priorAmount =
                    prior?.produitsParCategorie.find((p) => p.category === row.category)?.amount ?? null
                  return (
                    <TableRow key={row.category}>
                      <TableCell className="pl-4 text-muted-foreground">
                        {t.categories[row.category as Category] ?? row.category}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatEuro(row.amount)}
                      </TableCell>
                      {n1Label ? (
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {formatCell(priorAmount)}
                        </TableCell>
                      ) : null}
                      {n1Label ? (
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {fmtVar(row.amount, priorAmount)}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })
              )}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell>{t.accounting.totalProduitsExploitation}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatEuro(current.produits)}
                </TableCell>
                {n1Label ? (
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCell(prior?.produits)}
                  </TableCell>
                ) : null}
                {n1Label ? <TableCell /> : null}
              </TableRow>

              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={n1Label ? 4 : 2}
                  className="pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {t.accounting.chargesExploitationSection}
                </TableCell>
              </TableRow>
              {current.chargesParCategorie.length === 0 && current.dotation === 0 ? (
                <TableRow>
                  <TableCell colSpan={n1Label ? 4 : 2} className="text-sm text-muted-foreground">
                    {t.accounting.noCategoryData}
                  </TableCell>
                </TableRow>
              ) : (
                current.chargesParCategorie.map((row) => {
                  const priorAmount =
                    prior?.chargesParCategorie.find((p) => p.category === row.category)?.amount ?? null
                  return (
                    <TableRow key={row.category}>
                      <TableCell className="pl-4 text-muted-foreground">
                        {t.categories[row.category as Category] ?? row.category}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatEuro(row.amount)}
                      </TableCell>
                      {n1Label ? (
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {formatCell(priorAmount)}
                        </TableCell>
                      ) : null}
                      {n1Label ? (
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {fmtVar(row.amount, priorAmount)}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })
              )}
              {current.dotation > 0 ? (
                <TableRow>
                  <TableCell className="pl-4 text-muted-foreground">{t.accounting.dotationLabel}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatEuro(current.dotation)}
                  </TableCell>
                  {n1Label ? (
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      {formatCell(prior?.dotation)}
                    </TableCell>
                  ) : null}
                  {n1Label ? <TableCell /> : null}
                </TableRow>
              ) : null}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell>{t.accounting.totalChargesExploitation}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatEuro(current.charges)}
                </TableCell>
                {n1Label ? (
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCell(prior?.charges)}
                  </TableCell>
                ) : null}
                {n1Label ? <TableCell /> : null}
              </TableRow>
              <TableRow className="bg-destructive/10 font-semibold">
                <TableCell>{t.accounting.resultatExerciceLine}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatEuro(current.resultat, { signed: true })}
                </TableCell>
                {n1Label ? (
                  <TableCell className="text-right font-mono tabular-nums">
                    {prior ? formatEuro(prior.resultat, { signed: true }) : "—"}
                  </TableCell>
                ) : null}
                {n1Label ? <TableCell /> : null}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Bilan actif / passif */}
      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>{t.accounting.bilanTitle}</CardTitle>
          <CardDescription>{t.accounting.bilanSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <h4 className="px-4 pt-4 pb-1 text-sm font-semibold">{t.accounting.actif}</h4>
          <LedgerTable
            nLabel={nLabel}
            n1Label={n1Label}
            rows={[
              { label: t.accounting.immobilisationsSection, variant: "section" },
              {
                label: t.accounting.immobilisationsNettes,
                n: current.immobilisationsNettes,
                n1: prior?.immobilisationsNettes,
              },
              {
                label: t.accounting.totalActifImmobilise,
                n: current.immobilisationsNettes,
                n1: prior?.immobilisationsNettes,
                variant: "subtotal",
              },
              { label: t.accounting.actifCirculantSection, variant: "section" },
              { label: t.accounting.disponibilites, n: disponibilitesActif, n1: prior?.disponibilites },
              {
                label: t.accounting.totalActifCirculant,
                n: disponibilitesActif,
                n1: prior?.disponibilites,
                variant: "subtotal",
              },
              { label: t.accounting.totalActif, n: totalActif, n1: totalActifN1, variant: "total" },
            ]}
          />
          <h4 className="px-4 pt-4 pb-1 text-sm font-semibold">{t.accounting.passif}</h4>
          <LedgerTable
            nLabel={nLabel}
            n1Label={n1Label}
            rows={[
              { label: t.accounting.capitauxPropresSection, variant: "section" },
              {
                label: t.accounting.reportANouveau,
                n: current.reportANouveau,
                n1: prior?.reportANouveau,
                signed: true,
              },
              {
                label: t.accounting.resultatExerciceLine,
                n: current.resultat,
                n1: prior?.resultat,
                signed: true,
              },
              {
                label: t.accounting.totalCapitauxPropres,
                n: totalCapitauxPropres,
                n1: totalCapitauxPropresN1,
                variant: "subtotal",
                signed: true,
              },
              { label: t.accounting.dettesSection, variant: "section" },
              { label: t.accounting.dettes, n: totalDettes, n1: null },
              {
                label: t.accounting.totalDettesLabel,
                n: totalDettes,
                n1: null,
                variant: "subtotal",
              },
              { label: t.accounting.totalPassif, n: totalPassif, n1: totalPassifN1, variant: "total" },
            ]}
          />
          <div className="px-4 py-3">
            {balanced ? (
              <p className="text-xs text-success dark:text-[oklch(0.74_0.14_155)]">✓ {t.accounting.balanceOk}</p>
            ) : (
              <p className="text-xs text-[oklch(0.55_0.15_60)] dark:text-[oklch(0.8_0.14_65)]">
                {t.accounting.balanceGap.replace("{amount}", formatEuro(ecart, { signed: true }))}
              </p>
            )}
            {n1Label ? <p className="pt-1 text-xs text-muted-foreground">{t.accounting.debtsNotHistorized}</p> : null}
          </div>
        </CardContent>
      </Card>

      {/* Bilan détaillé */}
      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>{t.accounting.bilanDetailTitle}</CardTitle>
          <CardDescription>{t.accounting.bilanDetailSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.actif}
            </h4>
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm">
                <span>{t.accounting.caisse}</span>
                <span className="font-mono tabular-nums">{formatEuro(current.caisse)}</span>
              </div>
              {gocardlessAccounts && gocardlessAccounts.length > 0 ? (
                <>
                  {gocardlessAccounts.map((acc) => (
                    <div
                      key={acc.accountId}
                      className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm"
                    >
                      <span>{acc.label}</span>
                      <span className="font-mono tabular-nums">{formatEuro(acc.amount)}</span>
                    </div>
                  ))}
                  <Badge variant="outline" className="mt-1 w-fit text-[10px] text-muted-foreground">
                    {t.accounting.bankLive}
                  </Badge>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm">
                    <span>{t.accounting.banque}</span>
                    <span className="font-mono tabular-nums">{formatEuro(current.banque)}</span>
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">{t.accounting.bankEstimated}</p>
                </>
              )}
              {activeAssets.length > 0 ? (
                <>
                  {activeAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm"
                    >
                      <span>{asset.label}</span>
                      <span className="font-mono tabular-nums">
                        {formatEuro(sumNetBookValue([asset], current.periodEnd))}
                      </span>
                    </div>
                  ))}
                </>
              ) : null}
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm font-semibold">{t.accounting.totalActif}</span>
                <span className="font-mono text-base font-semibold tabular-nums">{formatEuro(totalActif)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.accounting.passif}
            </h4>
            <div className="flex flex-col">
              {unsettledDebts.length > 0 ? (
                unsettledDebts.map((debt) => (
                  <div
                    key={debt.id}
                    className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm"
                  >
                    <span>{debt.label}</span>
                    <span className="font-mono tabular-nums">{formatEuro(debt.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm">
                  <span>{t.accounting.dettes}</span>
                  <span className="font-mono tabular-nums">{formatEuro(0)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm">
                <span>{t.accounting.reportANouveau}</span>
                <span className="font-mono tabular-nums">
                  {formatEuro(current.reportANouveau, { signed: true })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-dashed py-2 text-sm">
                <span>{t.accounting.resultatExerciceLine}</span>
                <span className="font-mono tabular-nums">{formatEuro(current.resultat, { signed: true })}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm font-semibold">{t.accounting.totalPassif}</span>
                <span className="font-mono text-base font-semibold tabular-nums">{formatEuro(totalPassif)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
