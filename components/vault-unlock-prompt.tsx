"use client"

import { useEffect, useState } from "react"
import { LockIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useSecureVault } from "@/lib/secure-vault"
import { useAuth } from "@/lib/auth-context"
import { useTranslation } from "@/lib/i18n/context"

/** Demande la passphrase du coffre juste après la connexion, pour éviter d'avoir à aller dans Paramètres. */
export function VaultUnlockPrompt() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { available, hasVault, unlocked, loaded, unlock } = useSecureVault()
  const [dismissed, setDismissed] = useState(false)
  const [passphrase, setPassphrase] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const open = !!session && loaded && available && hasVault && !unlocked && !dismissed

  useEffect(() => {
    if (unlocked) setDismissed(false)
  }, [unlocked])

  function skip() {
    setDismissed(true)
    setPassphrase("")
    setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const ok = await unlock(passphrase)
    setBusy(false)
    if (!ok) {
      setError(t.settings.vaultWrongPassphrase)
      return
    }
    setPassphrase("")
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) skip() }}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockIcon className="size-4" />
              {t.settings.vaultTitle}
            </DialogTitle>
            <DialogDescription>{t.settings.vaultUnlockDescription}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="login-vault-passphrase">
                {t.settings.vaultPassphrase}
              </FieldLabel>
              <Input
                id="login-vault-passphrase"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value)
                  setError("")
                }}
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={skip}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {t.settings.vaultUnlockButton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
