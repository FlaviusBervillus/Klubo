"use client"

import { QuoteFormDialog } from "@/components/devis/quote-form-dialog"
import { QuotesTable } from "@/components/devis/quotes-table"
import { useTranslation } from "@/lib/i18n/context"

export default function DevisPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{t.devis.title}</h2>
          <p className="text-sm text-muted-foreground">{t.devis.subtitle}</p>
        </div>
        <QuoteFormDialog />
      </div>

      <QuotesTable />
    </div>
  )
}
