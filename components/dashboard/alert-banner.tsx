"use client"

import Link from "next/link"
import { TriangleAlertIcon, ArrowRightIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n/context"
import { useTransactionsStore } from "@/lib/transactions-store"

export function AlertBanner() {
  const { t } = useTranslation()
  const { transactions } = useTransactionsStore()
  const toCategorizeCount = transactions.filter((tx) => tx.status === "a_categoriser").length

  if (toCategorizeCount === 0) return null

  return (
    <Alert className="border-warning/40 bg-warning/10 [&>svg]:text-[oklch(0.55_0.15_60)] dark:[&>svg]:text-[oklch(0.8_0.14_65)]">
      <TriangleAlertIcon />
      <AlertTitle className="text-[oklch(0.42_0.12_55)] dark:text-[oklch(0.85_0.13_65)]">
        {t.dashboard.actionsRequired}
      </AlertTitle>
      <AlertDescription className="text-[oklch(0.45_0.08_55)] dark:text-[oklch(0.82_0.1_65)]">
        <span>
          {toCategorizeCount} transaction{toCategorizeCount > 1 ? "s" : ""} à catégoriser.
        </span>
      </AlertDescription>
      <div className="mt-2 flex flex-wrap gap-2 group-has-[>svg]/alert:col-start-2">
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          className="border-warning/40 bg-background"
          render={<Link href="/transactions?statut=a_categoriser" />}
        >
          {t.dashboard.categorize}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </Alert>
  )
}
