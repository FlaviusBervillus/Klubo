"use client"

import { AddDisciplineDialog } from "@/components/disciplines/add-discipline-dialog"
import { DisciplinesTable } from "@/components/disciplines/disciplines-table"
import { useTranslation } from "@/lib/i18n/context"

export default function DisciplinesPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t.disciplines.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.disciplines.subtitle}</p>
        </div>
        <AddDisciplineDialog />
      </div>

      <DisciplinesTable />
    </div>
  )
}
