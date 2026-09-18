"use client"

import { LockIcon, ShieldAlertIcon } from "lucide-react"

import { ChangeVaultPassphraseDialog } from "@/components/parametres/change-vault-passphrase-dialog"
import { ClubIdentityCard } from "@/components/parametres/club-identity-card"
import { StripeConnectCard } from "@/components/parametres/stripe-connect-card"
import { GoCardlessCard } from "@/components/parametres/gocardless-card"
import { BackupCard } from "@/components/parametres/backup-card"
import { VaultGate } from "@/components/parametres/vault-gate"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useAuth } from "@/lib/auth-context"
import { useTranslation } from "@/lib/i18n/context"
import { useSecureVault } from "@/lib/secure-vault"

const SETTINGS_ROLES = ["admin", "tresorier", "president"]

export default function ParametresPage() {
  const { session } = useAuth()
  const { t } = useTranslation()
  const { unlocked, lock } = useSecureVault()

  if (!session || !SETTINGS_ROLES.includes(session.role)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{t.settings.accessDenied}</EmptyTitle>
          <EmptyDescription>{t.settings.accessDeniedHint}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t.settings.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.settings.subtitle}</p>
        </div>
        {unlocked ? (
          <div className="flex flex-wrap gap-2">
            <ChangeVaultPassphraseDialog />
            <Button variant="outline" size="sm" onClick={lock}>
              <LockIcon data-icon="inline-start" />
              {t.settings.lockVault}
            </Button>
          </div>
        ) : null}
      </div>

      <ClubIdentityCard />

      <VaultGate>
        <div className="grid gap-4 lg:grid-cols-3">
          <StripeConnectCard />
          <GoCardlessCard />
          <BackupCard />
        </div>
      </VaultGate>
    </div>
  )
}
