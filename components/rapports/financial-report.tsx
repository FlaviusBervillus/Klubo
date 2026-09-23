"use client"

import { useEffect, useMemo, useState } from "react"
import { DownloadIcon, LandmarkIcon, PrinterIcon, TrendingUpIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  buildRecentMonthBuckets,
  buildSeasonMonthBuckets,
  computeCategoryPivot,
} from "@/lib/dashboard-stats"
import { useClubSettings } from "@/lib/club-settings"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro } from "@/lib/mock-data"
import { useSeasonTransactions, useSeasons } from "@/lib/seasons-store"

type Period = "mois" | "trimestre" | "annee"

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

export function FinancialReport() {
  const { t } = useTranslation()
  const { settings } = useClubSettings()
  const transactions = useSeasonTransactions()
  const { activeSeason } = useSeasons()
  const [period, setPeriod] = useState<Period>("annee")
  const [bankBalance, setBankBalance] = useState<number | null>(null)
  const [bankAvailable, setBankAvailable] = useState(false)

  useEffect(() => {
    async function loadBankBalance() {
      const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined
      if (!electronApi) return
      setBankAvailable(true)
      const settings = await electronApi.db.getSettings()
      const raw = settings.gocardlessBalance
      if (!raw) return
      try {
        setBankBalance((JSON.parse(raw) as { amount: number }).amount)
      } catch {
        // valeur corrompue, on garde le solde bancaire à "non synchronisé"
      }
    }
    loadBankBalance()
  }, [])

  const monthBuckets = useMemo(
    () => (activeSeason ? buildSeasonMonthBuckets(activeSeason) : buildRecentMonthBuckets(6)),
    [activeSeason],
  )
  const totalMonths = monthBuckets.length

  const periodOptions: { value: Period; label: string; count: number }[] = [
    { value: "mois", label: t.reports.periodMonth, count: Math.min(1, totalMonths) },
    { value: "trimestre", label: t.reports.periodQuarter, count: Math.min(3, totalMonths) },
    { value: "annee", label: t.reports.periodYear, count: totalMonths },
  ]

  const count = periodOptions.find((p) => p.value === period)!.count

  const fullRevenue = useMemo(
    () => computeCategoryPivot(transactions, "entree", monthBuckets),
    [transactions, monthBuckets],
  )
  const fullExpense = useMemo(
    () => computeCategoryPivot(transactions, "sortie", monthBuckets),
    [transactions, monthBuckets],
  )

  const start = totalMonths - count
  const months = fullRevenue.months.slice(start)
  const revenue = fullRevenue.rows.map((r) => ({
    category: r.category,
    values: r.values.slice(start),
  }))
  const expense = fullExpense.rows.map((r) => ({
    category: r.category,
    values: r.values.slice(start),
  }))

  const revenueTotals = months.map((_, i) => sum(revenue.map((r) => r.values[i])))
  const expenseTotals = months.map((_, i) => sum(expense.map((r) => r.values[i])))
  const revenueTotal = sum(revenueTotals)
  const expenseTotal = sum(expenseTotals)
  const net = revenueTotal - expenseTotal
  const positive = net >= 0

  function exportCsv() {
    const header = ["Catégorie", ...months, t.common.total]
    const rows: string[][] = [header, [t.reports.revenueSection]]
    for (const r of revenue) {
      rows.push([r.category, ...r.values.map(String), String(sum(r.values))])
    }
    rows.push([t.reports.totalRevenue, ...revenueTotals.map(String), String(revenueTotal)])
    rows.push([t.reports.expenseSection])
    for (const r of expense) {
      rows.push([r.category, ...r.values.map(String), String(sum(r.values))])
    }
    rows.push([t.reports.totalExpense, ...expenseTotals.map(String), String(expenseTotal)])
    rows.push([t.reports.netResult, ...months.map(() => ""), String(net)])

    const csv = rows.map((r) => r.join(";")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `rapport-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Export CSV généré", {
      description: `${a.download} téléchargé.`,
    })
  }

  function generatePdf() {
    toast.info("Ouverture de l'aperçu d'impression", {
      description: "Choisissez « Enregistrer en PDF » dans la boîte de dialogue.",
    })
    window.print()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            {periodOptions.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <DownloadIcon data-icon="inline-start" />
            {t.reports.exportCsv}
          </Button>
          <Button variant="outline" size="sm" onClick={generatePdf}>
            <PrinterIcon data-icon="inline-start" />
            {t.reports.generatePdf}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.reports.tableTitle}</CardTitle>
            <CardDescription>
              {activeSeason?.label ?? settings.season ?? t.seasons.allTime} · {months[0]}
              {months.length > 1 ? ` – ${months[months.length - 1]}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Catégorie</TableHead>
                  {months.map((m) => (
                    <TableHead key={m} className="text-right whitespace-nowrap">
                      {m}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">{t.common.total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell
                    colSpan={months.length + 2}
                    className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {t.reports.revenueSection}
                  </TableCell>
                </TableRow>
                {revenue.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell className="font-medium">{r.category}</TableCell>
                    {r.values.map((v, i) => (
                      <TableCell key={i} className="text-right font-mono tabular-nums">
                        {v ? formatEuro(v) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono font-medium tabular-nums">
                      {sum(r.values) ? formatEuro(sum(r.values)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>{t.reports.totalRevenue}</TableCell>
                  {revenueTotals.map((v, i) => (
                    <TableCell key={i} className="text-right font-mono tabular-nums">
                      {formatEuro(v)}
                    </TableCell>
                  ))}
                  <TableCell className="text-success text-right font-mono tabular-nums dark:text-[oklch(0.74_0.14_155)]">
                    {formatEuro(revenueTotal)}
                  </TableCell>
                </TableRow>

                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell
                    colSpan={months.length + 2}
                    className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {t.reports.expenseSection}
                  </TableCell>
                </TableRow>
                {expense.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell className="font-medium">{r.category}</TableCell>
                    {r.values.map((v, i) => (
                      <TableCell key={i} className="text-right font-mono tabular-nums">
                        {v ? formatEuro(v) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono font-medium tabular-nums">
                      {sum(r.values) ? formatEuro(sum(r.values)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>{t.reports.totalExpense}</TableCell>
                  {expenseTotals.map((v, i) => (
                    <TableCell key={i} className="text-right font-mono tabular-nums">
                      {formatEuro(v)}
                    </TableCell>
                  ))}
                  <TableCell className="text-destructive text-right font-mono tabular-nums">
                    {formatEuro(expenseTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              {t.reports.netResultTitle}
            </CardTitle>
            <CardDescription>{t.reports.netResultSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.reports.totalRevenue}</span>
              <span className="font-mono font-medium tabular-nums">
                {formatEuro(revenueTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.reports.totalExpense}</span>
              <span className="font-mono font-medium tabular-nums">
                − {formatEuro(expenseTotal)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.reports.netResult}</span>
              <span
                className={
                  "font-mono text-xl font-semibold tabular-nums " +
                  (positive
                    ? "text-success dark:text-[oklch(0.74_0.14_155)]"
                    : "text-destructive")
                }
              >
                {formatEuro(net, { signed: true })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {positive
                ? t.reports.netResultPositive
                : t.reports.netResultNegative}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <LandmarkIcon className="size-4" />
              {t.dashboard.bankBalance}
            </CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {bankBalance !== null ? formatEuro(bankBalance) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {!bankAvailable
                ? t.settings.electronOnlyFeature
                : bankBalance !== null
                  ? t.dashboard.bankBalanceHint
                  : t.dashboard.bankBalanceUnsynced}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
