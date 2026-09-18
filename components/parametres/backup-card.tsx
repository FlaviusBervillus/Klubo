"use client"

import { useState } from "react"
import { CloudUploadIcon, CloudDownloadIcon, HardDriveIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTranslation } from "@/lib/i18n/context"
import { formatDate } from "@/lib/mock-data"
import { useSecureVault } from "@/lib/secure-vault"
import { ApiCredentialsDialog } from "@/components/parametres/api-credentials-dialog"

const fields = [
  {
    key: "megaEmail",
    label: "Email Mega",
    placeholder: "tresorier@club.fr",
    type: "text" as const,
  },
  {
    key: "megaPassword",
    label: "Mot de passe Mega",
    placeholder: "••••••••",
    description: "Utilisé pour se connecter à votre vrai compte Mega.",
  },
]

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export function BackupCard() {
  const { t } = useTranslation()
  const { data, setSecret } = useSecureVault()
  const configured = !!data.megaEmail && !!data.megaPassword

  const [lastBackup, setLastBackup] = useState<{ fileName: string; size: number } | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [backups, setBackups] = useState<{ id: string; name: string; size: number; timestamp: number }[]>([])
  const [selectedBackup, setSelectedBackup] = useState("")
  const [restoring, setRestoring] = useState(false)

  async function runBackup() {
    if (!configured) {
      toast.error(t.settings.testConnectionNeedsKey)
      return
    }
    const electronApi = api()
    if (!electronApi) {
      toast.info(t.settings.electronOnlyFeature)
      return
    }
    setBackingUp(true)
    const result = await electronApi.mega.backup(data.megaEmail, data.megaPassword)
    setBackingUp(false)
    if (result.ok) {
      setLastBackup({ fileName: result.fileName, size: result.size })
      toast.success(t.settings.megaBackupSuccess)
    } else {
      toast.error(t.settings.megaBackupError, { description: result.error })
    }
  }

  async function openRestoreDialog() {
    if (!configured) {
      toast.error(t.settings.testConnectionNeedsKey)
      return
    }
    const electronApi = api()
    if (!electronApi) {
      toast.info(t.settings.electronOnlyFeature)
      return
    }
    setRestoreOpen(true)
    const result = await electronApi.mega.listBackups(data.megaEmail, data.megaPassword)
    if (result.ok) {
      setBackups(result.backups)
    } else {
      toast.error(t.settings.megaListError, { description: result.error })
      setRestoreOpen(false)
    }
  }

  async function restoreBackup() {
    const electronApi = api()
    if (!electronApi || !selectedBackup) return
    setRestoring(true)
    const result = await electronApi.mega.restore(data.megaEmail, data.megaPassword, selectedBackup)
    setRestoring(false)
    setRestoreOpen(false)
    if (result.ok) {
      toast.success(t.settings.megaRestoreSuccess)
    } else {
      toast.error(t.settings.megaRestoreError, { description: result.error })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDriveIcon className="size-4" />
          {t.settings.backupTitle}
        </CardTitle>
        <CardDescription>{t.settings.backupSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label={t.settings.lastBackup}>
          {lastBackup ? (
            <span className="text-right">
              <span className="block">{formatDate(new Date().toISOString(), true)}</span>
              <span className="text-xs text-muted-foreground">
                {lastBackup.fileName} · {(lastBackup.size / 1024 / 1024).toFixed(1)} Mo
              </span>
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Separator />
        <Row label={t.settings.megaCredentials}>
          {configured ? (
            <Badge
              variant="outline"
              className="border-transparent bg-success/12 font-medium text-success dark:text-[oklch(0.72_0.14_155)]"
            >
              {t.settings.keysConfigured}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-medium text-muted-foreground">
              {t.settings.keysMissing}
            </Badge>
          )}
        </Row>

        <ApiCredentialsDialog
          title="Identifiants Mega"
          description="Votre vrai compte Mega pour sauvegarder/restaurer la base. Chiffrés dans le coffre-fort local."
          fields={fields}
          values={data}
          onSave={setSecret}
          trigger={
            <Button variant="outline" className="w-full">
              {t.settings.configureMegaCredentials}
            </Button>
          }
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={runBackup}
            disabled={backingUp}
          >
            <CloudUploadIcon data-icon="inline-start" />
            {t.settings.runBackup}
          </Button>

          <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" className="flex-1" onClick={openRestoreDialog} />
              }
            >
              <CloudDownloadIcon data-icon="inline-start" />
              {t.settings.restore}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.settings.restoreConfirmTitle}</DialogTitle>
                <DialogDescription>
                  {t.settings.restoreConfirmDescription}
                </DialogDescription>
              </DialogHeader>

              {backups.length > 0 ? (
                <Select
                  value={selectedBackup}
                  onValueChange={(v) => v && setSelectedBackup(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.settings.selectBackupToRestore} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {backups.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">{t.settings.noBackupsFound}</p>
              )}

              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  {t.common.cancel}
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={restoreBackup}
                  disabled={!selectedBackup || restoring}
                >
                  {t.settings.restore}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}
