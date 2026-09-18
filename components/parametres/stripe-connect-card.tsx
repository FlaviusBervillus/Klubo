"use client"

import { useEffect, useState } from "react"
import { CreditCardIcon, CheckCircle2Icon, XCircleIcon, RefreshCwIcon } from "lucide-react"
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
import { useClientsStore } from "@/lib/clients-store"
import { useClubSettings } from "@/lib/club-settings"
import { useTranslation } from "@/lib/i18n/context"
import { formatDate } from "@/lib/mock-data"
import { useSecureVault } from "@/lib/secure-vault"
import { useTransactionsStore } from "@/lib/transactions-store"
import { ApiCredentialsDialog } from "@/components/parametres/api-credentials-dialog"

const fields = [
  {
    key: "stripeSecretKey",
    label: "Clé secrète API",
    placeholder: "sk_live_…",
    description: "Dashboard Stripe → Développeurs → Clés API.",
  },
  {
    key: "stripeWebhookSecret",
    label: "Clé de signature webhook",
    placeholder: "whsec_…",
    description: "Dashboard Stripe → Développeurs → Webhooks → Signer.",
  },
]

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export function StripeConnectCard() {
  const { t } = useTranslation()
  const { settings } = useClubSettings()
  const { data, setSecret } = useSecureVault()
  const { refresh: refreshTransactions } = useTransactionsStore()
  const { refresh: refreshClients } = useClientsStore()
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const configured = !!data.stripeSecretKey

  useEffect(() => {
    async function loadSyncState() {
      const electronApi = api()
      if (!electronApi) return
      const state = await electronApi.db.getSyncState("stripe")
      setLastSync(state?.last_synced_at ?? null)
    }
    loadSyncState()
  }, [syncing])

  async function testConnection() {
    if (!configured) {
      toast.error(t.settings.testConnectionNeedsKey)
      return
    }

    const electronApi = api()
    if (!electronApi) {
      toast.info(t.settings.testConnectionElectronOnly)
      return
    }

    setTesting(true)
    const result = await electronApi.testStripeConnection(data.stripeSecretKey)
    setTesting(false)

    if (result.ok) {
      toast.success(t.settings.testConnectionSuccess)
    } else {
      toast.error(t.settings.testConnectionError, { description: result.error })
    }
  }

  async function syncStripe() {
    if (!configured) {
      toast.error(t.settings.testConnectionNeedsKey)
      return
    }
    const electronApi = api()
    if (!electronApi) {
      toast.info(t.settings.electronOnlyFeature)
      return
    }

    setSyncing(true)
    const result = await electronApi.syncStripe(data.stripeSecretKey)
    setSyncing(false)

    if (result.ok) {
      await Promise.all([refreshTransactions(), refreshClients()])
      toast.success(t.settings.syncSuccess, {
        description: `${result.customers} clients · ${result.charges} transactions · ${result.disputes} litiges`,
      })
    } else {
      toast.error(t.settings.syncError, { description: result.error })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCardIcon className="size-4" />
          {t.settings.stripeTitle}
        </CardTitle>
        <CardDescription>{t.settings.stripeSubtitle}</CardDescription>
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
        {settings.stripeAccountName ? (
          <>
            <Separator />
            <Row label={t.settings.account}>{settings.stripeAccountName}</Row>
          </>
        ) : null}
        <Separator />
        <Row label={t.settings.lastWebhook}>
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
            title="Clés API Stripe Connect"
            description="Utilisées pour encaisser les cotisations et importer les vraies données. Chiffrées dans le coffre-fort local."
            fields={fields}
            values={data}
            onSave={setSecret}
            trigger={
              <Button variant="outline" className="flex-1">
                {t.settings.configureKeys}
              </Button>
            }
          />
          <Button
            variant="outline"
            className="flex-1"
            onClick={testConnection}
            disabled={testing}
          >
            {t.settings.testConnection}
          </Button>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={syncStripe}
          disabled={syncing}
        >
          <RefreshCwIcon data-icon="inline-start" />
          {syncing ? t.settings.syncing : t.settings.syncStripe}
        </Button>
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
