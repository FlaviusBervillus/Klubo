"use client"

import { useEffect, useState } from "react"
import { CheckCircle2Icon, CloudIcon, RefreshCwIcon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SyncConflictDialog } from "@/components/parametres/sync-conflict-dialog"
import { useTranslation } from "@/lib/i18n/context"
import { formatDate } from "@/lib/mock-data"
import type { NasSyncStatus } from "@/types/electron"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

/** Contrairement aux clés Stripe/GoCardless, la configuration NAS n'est volontairement pas dans le
 * coffre-fort chiffré : elle doit rester lisible par le process principal sans déverrouillage, pour
 * que la synchro en tâche de fond (démarrage + toutes les 2h, voir electron/nas-sync.js) marche de
 * façon autonome — c'est pourquoi cette carte vit hors du <VaultGate>. */
export function NasSyncCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const [serverUrl, setServerUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [status, setStatus] = useState<NasSyncStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [conflictsOpen, setConflictsOpen] = useState(false)

  useEffect(() => {
    const electronApi = api()
    if (!electronApi) return
    electronApi.nas.getConfig().then((config) => {
      setServerUrl(config.serverUrl)
      setApiKey(config.apiKey)
    })
    electronApi.nas.getStatus().then(setStatus)
    const unsubscribe = electronApi.nas.onStatusChange(setStatus)
    return unsubscribe
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const electronApi = api()
    if (!electronApi) return
    setSaving(true)
    await electronApi.nas.setConfig({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim() })
    setSaving(false)
    toast.success(t.settings.nasSyncSaved)
    electronApi.nas.getStatus().then(setStatus)
  }

  async function handleSyncNow() {
    const electronApi = api()
    if (!electronApi) return
    setSyncing(true)
    const result = await electronApi.nas.syncNow()
    setSyncing(false)
    if (result.ok) {
      toast.success(t.settings.nasSyncDone)
    } else {
      toast.error(t.settings.nasSyncError, { description: result.error })
    }
    electronApi.nas.getStatus().then(setStatus)
  }

  const badge = !status?.configured ? (
    <Badge variant="outline" className="font-medium text-muted-foreground">
      {t.settings.nasSyncNotConfigured}
    </Badge>
  ) : status.lastError ? (
    <Badge variant="outline" className="border-transparent bg-destructive/10 font-medium text-destructive">
      <XCircleIcon data-icon="inline-start" />
      {t.settings.nasSyncError}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-transparent bg-success/12 font-medium text-success dark:text-[oklch(0.72_0.14_155)]"
    >
      <CheckCircle2Icon data-icon="inline-start" />
      {t.settings.nasSyncConnected}
    </Badge>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudIcon className="size-4" />
          {t.settings.nasSyncTitle}
        </CardTitle>
        <CardDescription>{t.settings.nasSyncSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label={t.settings.status}>{badge}</Row>
        <Separator />
        <Row label={t.settings.nasSyncLastSync}>
          {status?.lastSyncedAt ? formatDate(status.lastSyncedAt, true) : t.settings.nasSyncNever}
        </Row>
        {status && status.pendingConflictsCount > 0 ? (
          <>
            <Separator />
            <Row label={t.settings.nasSyncConflictsCount}>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setConflictsOpen(true)}>
                {status.pendingConflictsCount} — {t.settings.nasSyncResolveConflicts}
              </Button>
            </Row>
          </>
        ) : null}

        {canEdit ? (
          <form onSubmit={handleSave} className="mt-1 flex flex-col gap-3">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="nas-sync-url">{t.settings.nasSyncUrlLabel}</FieldLabel>
                <Input
                  id="nas-sync-url"
                  placeholder="http://192.168.1.10:3939"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="nas-sync-api-key">{t.settings.nasSyncApiKeyLabel}</FieldLabel>
                <Input
                  id="nas-sync-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
            </FieldGroup>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" variant="outline" className="flex-1" disabled={saving}>
                {t.settings.nasSyncSave}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleSyncNow}
                disabled={syncing || !status?.configured}
              >
                <RefreshCwIcon data-icon="inline-start" />
                {syncing ? t.settings.nasSyncSyncing : t.settings.nasSyncNow}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-1 w-full"
            onClick={handleSyncNow}
            disabled={syncing || !status?.configured}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {syncing ? t.settings.nasSyncSyncing : t.settings.nasSyncNow}
          </Button>
        )}
      </CardContent>

      <SyncConflictDialog
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        onResolved={() => {
          api()
            ?.nas.getStatus()
            .then(setStatus)
        }}
      />
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}
