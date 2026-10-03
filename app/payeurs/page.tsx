"use client"

import { AddPayerDialog } from "@/components/payeurs/add-payer-dialog"
import { PayersTable } from "@/components/payeurs/payers-table"
import { useTranslation } from "@/lib/i18n/context"

export default function PayersPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t.payers.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.payers.subtitle}</p>
        </div>
        <AddPayerDialog />
      </div>

      <PayersTable />
    </div>
  )
}
