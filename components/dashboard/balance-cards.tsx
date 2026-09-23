"use client"

import { useEffect, useState } from "react"
import {
  BanknoteIcon,
  LandmarkIcon,
  ScaleIcon,
  CheckCircle2Icon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { computeAccountBalance } from "@/lib/dashboard-stats"
import { useTranslation } from "@/lib/i18n/context"
import { formatEuro } from "@/lib/mock-data"
import { useSeasonTransactions } from "@/lib/seasons-store"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export function BalanceCards() {
  const { t } = useTranslation()
  const transactions = useSeasonTransactions()
  const [available, setAvailable] = useState(false)
  const [bankBalance, setBankBalance] = useState<number | null>(null)

  useEffect(() => {
    async function loadBankBalance() {
      const electronApi = api()
      if (!electronApi) return
      setAvailable(true)
      const settings = await electronApi.db.getSettings()
      const raw = settings.gocardlessBalance
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { amount: number }
          setBankBalance(parsed.amount)
        } catch {
          // valeur corrompue, on garde le solde bancaire à 0 (non synchronisé)
        }
      }
    }
    loadBankBalance()
  }, [])

  const comptable = computeAccountBalance(transactions)
  const bancaire = bankBalance ?? 0
  const ecart = Math.round((bancaire - comptable) * 100) / 100
  const balanced = Math.abs(ecart) < 0.01

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <BanknoteIcon className="size-4" />
            {t.dashboard.accountBalance}
          </CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">
            {formatEuro(comptable)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {t.dashboard.accountBalanceHint}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <LandmarkIcon className="size-4" />
            {t.dashboard.bankBalance}
          </CardDescription>
          <CardTitle className="font-mono text-3xl tabular-nums">
            {formatEuro(bancaire)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {!available
              ? t.settings.electronOnlyFeature
              : bankBalance !== null
                ? t.dashboard.bankBalanceHint
                : t.dashboard.bankBalanceUnsynced}
          </p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "border-2",
          balanced
            ? "border-success/40 bg-success/5"
            : "border-destructive/40 bg-destructive/5",
        )}
      >
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ScaleIcon className="size-4" />
            {t.dashboard.balanceGap}
          </CardDescription>
          <CardTitle
            className={cn(
              "flex items-center gap-2 font-mono text-3xl tabular-nums",
              balanced
                ? "text-success dark:text-[oklch(0.74_0.14_155)]"
                : "text-destructive",
            )}
          >
            {balanced ? "0,00 €" : formatEuro(ecart, { signed: true })}
            {balanced ? <CheckCircle2Icon className="size-6" /> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {balanced ? t.dashboard.balanceGapOk : t.dashboard.balanceGapKo}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
