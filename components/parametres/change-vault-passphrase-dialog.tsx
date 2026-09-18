"use client"

import { useState } from "react"
import { KeyRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useTranslation } from "@/lib/i18n/context"
import { useSecureVault } from "@/lib/secure-vault"

export function ChangeVaultPassphraseDialog() {
  const { t } = useTranslation()
  const { changePassphrase } = useSecureVault()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  function reset() {
    setCurrent("")
    setNext("")
    setConfirm("")
    setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < 8) {
      setError(t.settings.vaultTooShort)
      return
    }
    if (next !== confirm) {
      setError(t.settings.vaultMismatch)
      return
    }
    setBusy(true)
    const ok = await changePassphrase(current, next)
    setBusy(false)
    if (!ok) {
      setError(t.settings.vaultWrongPassphrase)
      return
    }
    toast.success(t.settings.vaultPassphraseChanged)
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRoundIcon data-icon="inline-start" />
            {t.settings.changeVaultPassphrase}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t.settings.vaultChangeTitle}</DialogTitle>
            <DialogDescription>
              {t.settings.vaultChangeDescription}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="vault-current-pass">
                {t.settings.vaultCurrentPassphrase}
              </FieldLabel>
              <Input
                id="vault-current-pass"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value)
                  setError("")
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vault-new-pass">
                {t.settings.vaultNewPassphrase}
              </FieldLabel>
              <Input
                id="vault-new-pass"
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => {
                  setNext(e.target.value)
                  setError("")
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vault-confirm-pass">
                {t.settings.vaultConfirmNewPassphrase}
              </FieldLabel>
              <Input
                id="vault-confirm-pass"
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

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t.common.cancel}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {t.settings.changeVaultPassphrase}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
