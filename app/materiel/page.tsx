"use client"

import { AddEquipmentDialog } from "@/components/materiel/add-equipment-dialog"
import { EquipmentTable } from "@/components/materiel/equipment-table"
import { useTranslation } from "@/lib/i18n/context"

export default function MaterielPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t.materiel.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.materiel.subtitle}</p>
        </div>
        <AddEquipmentDialog />
      </div>

      <EquipmentTable />
    </div>
  )
}
