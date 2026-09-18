"use client"

import { useState } from "react"
import { LockIcon, LockOpenIcon } from "lucide-react"

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
import { useSecureVault } from "@/lib/secure-vault"
import { useTranslation } from "@/lib/i18n/context"

export function VaultGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { hasVault, unlocked, loaded, unlock, createVault } = useSecureVault()
  const [passphrase, setPassphrase] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (!loaded) return null

  if (unlocked) return <>{children}</>

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (passphrase.length < 8) {
      setError(t.settings.vaultTooShort)
      return
    }
    if (passphrase !== confirm) {
      setError(t.settings.vaultMismatch)
      return
    }
    setBusy(true)
    await createVault(passphrase)
    setBusy(false)
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const ok = await unlock(passphrase)
    setBusy(false)
    if (!ok) setError(t.settings.vaultWrongPassphrase)
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hasVault ? <LockIcon className="size-4" /> : <LockOpenIcon className="size-4" />}
          {t.settings.vaultTitle}
        </CardTitle>
        <CardDescription>
          {hasVault
            ? t.settings.vaultUnlockDescription
            : t.settings.vaultCreateDescription}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={hasVault ? handleUnlock : handleCreate}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="vault-passphrase">
                {t.settings.vaultPassphrase}
              </FieldLabel>
              <Input
                id="vault-passphrase"
                type="password"
                autoComplete={hasVault ? "current-password" : "new-password"}
                required
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value)
                  setError("")
                }}
              />
            </Field>
            {!hasVault ? (
              <Field>
                <FieldLabel htmlFor="vault-confirm">
                  {t.settings.vaultConfirmPassphrase}
                </FieldLabel>
                <Input
                  id="vault-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                    setError("")
                  }}
                />
              </Field>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {hasVault ? t.settings.vaultUnlockButton : t.settings.vaultCreateButton}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
