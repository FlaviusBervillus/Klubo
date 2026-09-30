"use client"

import { useState } from "react"
import { FileSpreadsheetIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useClientsStore } from "@/lib/clients-store"
import { useTranslation } from "@/lib/i18n/context"

export function ImportClientsExcelButton() {
  const { t } = useTranslation()
  const { importClientsExcel, available } = useClientsStore()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (!available) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    setBusy(true)
    const result = await importClientsExcel()
    setBusy(false)
    if (result.ok) {
      toast.success(t.clients.importSuccessTitle, {
        description: t.clients.importSuccessDescription
          .replace("{created}", String(result.created))
          .replace("{updated}", String(result.updated))
          .replace("{skipped}", String(result.skipped)),
      })
    } else if (!result.canceled) {
      toast.error(result.error || t.clients.importErrorTitle)
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={busy}>
      <FileSpreadsheetIcon data-icon="inline-start" />
      {busy ? t.clients.importing : t.clients.importExcel}
    </Button>
  )
}
