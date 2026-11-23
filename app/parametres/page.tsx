"use client"

import { LockIcon, ShieldAlertIcon } from "lucide-react"

import { ChangeVaultPassphraseDialog } from "@/components/parametres/change-vault-passphrase-dialog"
import { ClubIdentityCard } from "@/components/parametres/club-identity-card"
import { StripeConnectCard } from "@/components/parametres/stripe-connect-card"
import { GoCardlessCard } from "@/components/parametres/gocardless-card"
import { SeasonsCard } from "@/components/parametres/seasons-card"
import { BackupCard } from "@/components/parametres/backup-card"
import { NasSyncCard } from "@/components/parametres/nas-sync-card"
import { DangerZoneCard } from "@/components/parametres/danger-zone-card"
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

export default function ParametresPage() {
  const { session } = useAuth()
  const { t } = useTranslation()
  const { unlocked, lock } = useSecureVault()

  if (!session) {
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

  // Tous les rôles connectés peuvent désormais CONSULTER les Paramètres (utile dès que des données
  // partagées — comptes, config NAS, coffre-fort — se synchronisent entre plusieurs postes) ; seul
  // l'administrateur peut les MODIFIER, voir canEdit passé à chaque carte ci-dessous.
  const canEdit = session.role === "admin"

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
            {canEdit ? <ChangeVaultPassphraseDialog /> : null}
            <Button variant="outline" size="sm" onClick={lock}>
              <LockIcon data-icon="inline-start" />
              {t.settings.lockVault}
            </Button>
          </div>
        ) : null}
      </div>

      <ClubIdentityCard canEdit={canEdit} />

      <SeasonsCard canEdit={canEdit} />

      {/* La config NAS (Phase C/D) vit volontairement hors du <VaultGate> : elle n'est pas dans le
          coffre-fort chiffré, pour que la synchro en tâche de fond marche sans déverrouillage. */}
      <NasSyncCard canEdit={canEdit} />

      <VaultGate>
        <div className="grid gap-4 lg:grid-cols-3">
          <StripeConnectCard canEdit={canEdit} />
          <GoCardlessCard canEdit={canEdit} />
          <BackupCard />
        </div>
      </VaultGate>

      {session.role === "admin" ? <DangerZoneCard /> : null}
    </div>
  )
}
