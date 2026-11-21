"use client"

import { useState } from "react"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { QuoteFormDialog } from "@/components/devis/quote-form-dialog"
import { QuotesTable } from "@/components/devis/quotes-table"
import { InvoicesTable } from "@/components/devis/invoices-table"
import { useTranslation } from "@/lib/i18n/context"

export default function DevisPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{t.devis.title}</h2>
          <p className="text-sm text-muted-foreground">{t.devis.subtitle}</p>
        </div>
        <QuoteFormDialog />
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.devis.searchPlaceholder}
          className="pl-9"
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-medium tracking-tight">{t.devis.quotesSectionTitle}</h3>
        <QuotesTable search={search} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-medium tracking-tight">{t.devis.invoicesSectionTitle}</h3>
        <InvoicesTable search={search} />
      </div>
    </div>
  )
}
