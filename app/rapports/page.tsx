"use client"

import { FinancialReport } from "@/components/rapports/financial-report"
import { useTranslation } from "@/lib/i18n/context"

export default function RapportsPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t.reports.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.reports.subtitle}</p>
      </div>

      <FinancialReport />
    </div>
  )
}
