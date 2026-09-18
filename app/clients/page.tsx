"use client"

import { AddClientDialog } from "@/components/clients/add-client-dialog"
import { ClientsTable } from "@/components/clients/clients-table"
import { useTranslation } from "@/lib/i18n/context"

export default function ClientsPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t.clients.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.clients.subtitle}</p>
        </div>
        <AddClientDialog />
      </div>

      <ClientsTable />
    </div>
  )
}
