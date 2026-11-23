"use client"

import { Fragment, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useTranslation } from "@/lib/i18n/context"
import type { NasSyncConflict } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

// Colonnes de mécanique de sync, jamais pertinentes à montrer au trésorier dans une différence.
const SYNC_INTERNAL_COLUMNS = new Set(["sync_version", "updated_at", "deleted_at", "created_at"])

/** Un seul composant générique pour les ~17 tables synchronisées : calcule la différence champ par
 * champ entre la version locale et distante d'une même ligne, sans connaître la forme précise de
 * chaque table — évite d'avoir à écrire une vue de conflit par table. `local`/`remote` valent `null`
 * quand ce côté du conflit est une suppression (voir electron/nas-sync.js, qui transmet payload_json
 * tel quel pour un op "delete") plutôt qu'un payload complet. */
function diffFields(
  local: Record<string, unknown> | null,
  remote: Record<string, unknown> | null,
) {
  const keys = new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])
  const rows: { key: string; local: unknown; remote: unknown }[] = []
  for (const key of keys) {
    if (SYNC_INTERNAL_COLUMNS.has(key)) continue
    const localValue = local?.[key]
    const remoteValue = remote?.[key]
    if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
      rows.push({ key, local: localValue, remote: remoteValue })
    }
  }
  return rows
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Oui" : "Non"
  return String(value)
}

export function SyncConflictDialog({
  open,
  onOpenChange,
  onResolved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolved: () => void
}) {
  const { t } = useTranslation()
  const [conflicts, setConflicts] = useState<NasSyncConflict[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const electronApi = api()
      if (electronApi) {
        const list = await electronApi.nas.getConflicts()
        if (!cancelled) setConflicts(list)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open])

  async function resolve(id: string, resolution: "local" | "remote") {
    const electronApi = api()
    if (!electronApi) return
    setBusyId(id)
    const result = await electronApi.nas.resolveConflict(id, resolution)
    setBusyId(null)
    if (result.ok) {
      toast.success(t.settings.nasSyncResolved)
      setConflicts((list) => list.filter((c) => c.id !== id))
      onResolved()
    } else {
      toast.error(t.settings.nasSyncError, { description: result.error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.settings.nasSyncConflictDialogTitle}</DialogTitle>
          <DialogDescription>{t.settings.nasSyncConflictDialogDescription}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">…</p>
        ) : conflicts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.settings.nasSyncNoConflicts}</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {conflicts.map((conflict) => {
              const fields = diffFields(conflict.localPayload, conflict.remotePayload)
              return (
                <div key={conflict.id} className="flex flex-col gap-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="font-medium">
                      {t.settings.nasSyncConflictTable} : {conflict.table}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-sm">
                    <span className="font-medium text-muted-foreground" />
                    <span className="font-medium text-muted-foreground">{t.settings.nasSyncConflictLocal}</span>
                    <span className="font-medium text-muted-foreground">{t.settings.nasSyncConflictRemote}</span>
                    {conflict.localPayload === null || conflict.remotePayload === null ? (
                      <Fragment>
                        <span className="text-muted-foreground">{t.settings.nasSyncConflictDeletedRow}</span>
                        <span className="font-medium">
                          {conflict.localPayload === null ? t.settings.nasSyncConflictDeleted : "—"}
                        </span>
                        <span className="font-medium">
                          {conflict.remotePayload === null ? t.settings.nasSyncConflictDeleted : "—"}
                        </span>
                      </Fragment>
                    ) : null}
                    {fields.map((f) => (
                      <Fragment key={f.key}>
                        <span className="text-muted-foreground">{f.key}</span>
                        <span className="font-medium">{formatValue(f.local)}</span>
                        <span className="font-medium">{formatValue(f.remote)}</span>
                      </Fragment>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={busyId === conflict.id}
                      onClick={() => resolve(conflict.id, "local")}
                    >
                      {t.settings.nasSyncKeepLocal}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={busyId === conflict.id}
                      onClick={() => resolve(conflict.id, "remote")}
                    >
                      {t.settings.nasSyncKeepRemote}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
