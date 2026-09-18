"use client"

import { useEffect, useState } from "react"
import { LandmarkIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
    key: "gocardlessSecretId",
    label: "Secret ID GoCardless",
    placeholder: "sandbox_… ou live_…",
    type: "text" as const,
    description: "GoCardless Bank Account Data → Créer des identifiants API.",
  },
  {
    key: "gocardlessSecretKey",
    label: "Secret Key GoCardless",
    placeholder: "••••••••",
  },
]

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export function GoCardlessCard() {
  const { t } = useTranslation()
  const { data, setSecret } = useSecureVault()
  const configured = !!data.gocardlessSecretId && !!data.gocardlessSecretKey
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([])
  const [institutionId, setInstitutionId] = useState("")
  const [step, setStep] = useState<"choose" | "waiting" | "syncing">("choose")

  useEffect(() => {
    async function loadSyncState() {
      const electronApi = api()
      if (!electronApi) return
      const state = await electronApi.db.getSyncState("gocardless")
      setLastSync(state?.last_synced_at ?? null)
    }
    loadSyncState()
  }, [])

  useEffect(() => {
    const electronApi = api()
    if (!electronApi) return
    return electronApi.gocardless.onCallback(async (requisitionId) => {
      setStep("syncing")
      const result = await electronApi.gocardless.completeSync(
        data.gocardlessSecretId,
        data.gocardlessSecretKey,
        requisitionId,
      )
      setDialogOpen(false)
      if (result.ok) {
        const state = await electronApi.db.getSyncState("gocardless")
        setLastSync(state?.last_synced_at ?? null)
        toast.success(t.settings.gocardlessSyncDone, {
          description: `${result.count} opérations importées`,
        })
      } else {
        toast.error(t.settings.gocardlessSyncError, { description: result.error })
      }
    })
  }, [data.gocardlessSecretId, data.gocardlessSecretKey, t])

  async function openConnectDialog() {
    if (!configured) {
      toast.error(t.settings.testConnectionNeedsKey)
      return
    }
    const electronApi = api()
    if (!electronApi) {
      toast.info(t.settings.electronOnlyFeature)
      return
    }
    setStep("choose")
    setDialogOpen(true)
    const result = await electronApi.gocardless.listInstitutions(
      data.gocardlessSecretId,
      data.gocardlessSecretKey,
      "FR",
    )
    if (result.ok) {
      setInstitutions(result.institutions)
    } else {
      toast.error(t.settings.gocardlessSyncError, { description: result.error })
      setDialogOpen(false)
    }
  }

  async function startConsent() {
    const electronApi = api()
    if (!electronApi || !institutionId) return
    const result = await electronApi.gocardless.startConsent(
      data.gocardlessSecretId,
      data.gocardlessSecretKey,
      institutionId,
    )
    if (result.ok) {
      setStep("waiting")
      toast.info(t.settings.gocardlessConnecting)
    } else {
      toast.error(t.settings.gocardlessSyncError, { description: result.error })
      setDialogOpen(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="size-4" />
          {t.settings.gocardlessTitle}
        </CardTitle>
        <CardDescription>{t.settings.gocardlessSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label={t.settings.status}>
          {configured ? (
            <Badge
              variant="outline"
              className="border-transparent bg-success/12 font-medium text-success dark:text-[oklch(0.72_0.14_155)]"
            >
              <CheckCircle2Icon data-icon="inline-start" />
              {t.settings.connected}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-transparent bg-destructive/10 font-medium text-destructive">
              <XCircleIcon data-icon="inline-start" />
              {t.settings.notConnected}
            </Badge>
          )}
        </Row>
        <Separator />
        <Row label={t.settings.lastSync}>
          {lastSync ? formatDate(lastSync, true) : "—"}
        </Row>
        <Separator />
        <Row label={t.settings.apiKeys}>
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

        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <ApiCredentialsDialog
            title="Clés API GoCardless"
            description="Utilisées pour synchroniser le relevé bancaire réel. Chiffrées dans le coffre-fort local."
            fields={fields}
            values={data}
            onSave={setSecret}
            trigger={
              <Button variant="outline" className="flex-1">
                {t.settings.configureKeys}
              </Button>
            }
          />
          <Button variant="outline" className="flex-1" onClick={openConnectDialog}>
            {t.settings.connectBank}
          </Button>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.settings.selectInstitution}</DialogTitle>
            {step === "choose" ? (
              <DialogDescription>{t.settings.chooseInstitution}</DialogDescription>
            ) : null}
          </DialogHeader>

          {step === "choose" ? (
            <>
              <Select
                value={institutionId}
                onValueChange={(v) => v && setInstitutionId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button onClick={startConsent} disabled={!institutionId}>
                  {t.settings.connectBank}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "waiting" || step === "syncing" ? (
            <p className="text-sm text-muted-foreground">
              {step === "waiting" ? t.settings.gocardlessWaiting : t.settings.syncing}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
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
