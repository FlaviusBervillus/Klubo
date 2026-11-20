"use client"

import { useEffect, useState } from "react"
import { UserCogIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/auth-context"
import { useTranslation } from "@/lib/i18n/context"

export function AccountDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t } = useTranslation()
  const {
    session,
    updateProfile,
    changePassword,
    setSecurityQuestion,
    hasTotp,
    setupTotp,
    confirmTotp,
    disableTotp,
  } = useAuth()
  const [open, setOpen] = useState(false)

  const [name, setName] = useState(session?.name ?? "")
  const [email, setEmail] = useState(session?.email ?? "")

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")

  const [securityQuestion, setSecurityQuestionValue] = useState("")
  const [securityAnswer, setSecurityAnswer] = useState("")

  const [totpEnabled, setTotpEnabled] = useState(false)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [totpCode, setTotpCode] = useState("")
  const [totpError, setTotpError] = useState("")

  useEffect(() => {
    if (open && session) {
      setName(session.name)
      setEmail(session.email)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordError("")
      setSecurityQuestionValue("")
      setSecurityAnswer("")
      setTotpSetup(null)
      setTotpCode("")
      setTotpError("")
      hasTotp().then(setTotpEnabled)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session])

  if (!session) return null

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    await updateProfile({ name, email })
    toast.success(t.account.profileSaved)
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPasswordError(t.account.passwordTooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t.account.passwordMismatch)
      return
    }
    const ok = await changePassword(currentPassword, newPassword)
    if (!ok) {
      setPasswordError(t.account.currentPasswordWrong)
      return
    }
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    toast.success(t.account.passwordChanged)
  }

  async function handleSecurityQuestionSubmit(e: React.FormEvent) {
    e.preventDefault()
    await setSecurityQuestion(securityQuestion, securityAnswer)
    toast.success(t.account.securityQuestionSaved)
  }

  async function handleStartTotpSetup() {
    const result = await setupTotp()
    if (result) setTotpSetup(result)
  }

  async function handleConfirmTotp(e: React.FormEvent) {
    e.preventDefault()
    if (!totpSetup) return
    const ok = await confirmTotp(totpSetup.secret, totpCode)
    if (!ok) {
      setTotpError(t.account.totpWrongCode)
      return
    }
    setTotpEnabled(true)
    setTotpSetup(null)
    setTotpCode("")
    setTotpError("")
    toast.success(t.account.totpEnabled)
  }

  async function handleDisableTotp() {
    await disableTotp()
    setTotpEnabled(false)
    toast.success(t.account.totpDisabled)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button variant="ghost" size="sm">
              <UserCogIcon data-icon="inline-start" />
              {t.account.trigger}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.account.title}</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        <form onSubmit={handleProfileSubmit}>
          <FieldGroup>
            <p className="text-sm font-medium">{t.account.profileTitle}</p>
            <p className="-mt-2 text-xs text-muted-foreground">
              {t.account.profileDescription}
            </p>
            <Field>
              <FieldLabel htmlFor="account-name">{t.account.name}</FieldLabel>
              <Input
                id="account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-email">{t.account.email}</FieldLabel>
              <Input
                id="account-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" size="sm" className="w-fit">
              {t.account.saveProfile}
            </Button>
          </FieldGroup>
        </form>

        <Separator />

        <form onSubmit={handlePasswordSubmit}>
          <FieldGroup>
            <p className="text-sm font-medium">{t.account.passwordTitle}</p>
            <p className="-mt-2 text-xs text-muted-foreground">
              {t.account.passwordDescription}
            </p>
            <Field>
              <FieldLabel htmlFor="account-current-password">
                {t.account.currentPassword}
              </FieldLabel>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                  setPasswordError("")
                }}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-new-password">
                {t.account.newPassword}
              </FieldLabel>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setPasswordError("")
                }}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-confirm-password">
                {t.account.confirmNewPassword}
              </FieldLabel>
              <Input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setPasswordError("")
                }}
                required
              />
            </Field>

            {passwordError ? (
              <p className="text-sm text-destructive">{passwordError}</p>
            ) : null}

            <Button type="submit" size="sm" variant="outline" className="w-fit">
              {t.account.changePassword}
            </Button>
          </FieldGroup>
        </form>

        <Separator />

        <form onSubmit={handleSecurityQuestionSubmit}>
          <FieldGroup>
            <p className="text-sm font-medium">{t.account.securityQuestionTitle}</p>
            <p className="-mt-2 text-xs text-muted-foreground">
              {t.account.securityQuestionDescription}
            </p>
            <Field>
              <FieldLabel htmlFor="account-security-question">
                {t.account.securityQuestionLabel}
              </FieldLabel>
              <Input
                id="account-security-question"
                value={securityQuestion}
                onChange={(e) => setSecurityQuestionValue(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-security-answer">
                {t.account.securityAnswerLabel}
              </FieldLabel>
              <Input
                id="account-security-answer"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" size="sm" variant="outline" className="w-fit">
              {t.account.saveSecurityQuestion}
            </Button>
          </FieldGroup>
        </form>

        <Separator />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t.account.totpTitle}</p>
              <p className="text-xs text-muted-foreground">{t.account.totpDescription}</p>
            </div>
            {totpEnabled ? (
              <Badge variant="outline" className="border-success/40 text-success">
                {t.account.totpActiveBadge}
              </Badge>
            ) : null}
          </div>

          {totpEnabled && !totpSetup ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit text-destructive"
              onClick={handleDisableTotp}
            >
              {t.account.totpDisable}
            </Button>
          ) : null}

          {!totpEnabled && !totpSetup ? (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={handleStartTotpSetup}>
              {t.account.totpEnable}
            </Button>
          ) : null}

          {totpSetup ? (
            <form onSubmit={handleConfirmTotp} className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{t.account.totpSetupHint}</p>
              <Field>
                <FieldLabel>{t.account.totpSecretLabel}</FieldLabel>
                <code className="block rounded-lg border bg-muted/50 px-2.5 py-2 text-xs break-all">
                  {totpSetup.secret}
                </code>
              </Field>
              <Field>
                <FieldLabel htmlFor="totp-confirm-code">{t.account.totpCodeLabel}</FieldLabel>
                <Input
                  id="totp-confirm-code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => {
                    setTotpCode(e.target.value)
                    setTotpError("")
                  }}
                />
              </Field>
              {totpError ? <p className="text-sm text-destructive">{totpError}</p> : null}
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="w-fit">
                  {t.account.totpConfirm}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-fit"
                  onClick={() => {
                    setTotpSetup(null)
                    setTotpCode("")
                    setTotpError("")
                  }}
                >
                  {t.common.cancel}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
