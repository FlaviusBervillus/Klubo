"use client"

import { useState } from "react"
import { MonitorXIcon, SwordIcon } from "lucide-react"

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
import { ForgotPasswordDialog } from "@/components/account/forgot-password-dialog"
import { LanguageToggle } from "@/components/language-toggle"
import { useAuth } from "@/lib/auth-context"
import { useClubSettings } from "@/lib/club-settings"
import { useTranslation } from "@/lib/i18n/context"

export default function LoginPage() {
  const { available, needsSetup, login, createFirstAdmin } = useAuth()
  const { t } = useTranslation()
  const { settings } = useClubSettings()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt={settings.name}
              className="size-full object-cover"
            />
          ) : (
            <SwordIcon className="size-6" />
          )}
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {settings.name}
        </span>
      </div>

      {!available ? (
        <DesktopRequiredCard />
      ) : needsSetup ? (
        <SetupCard onCreate={createFirstAdmin} />
      ) : (
        <LoginCard onLogin={login} />
      )}
    </div>
  )
}

function DesktopRequiredCard() {
  const { t } = useTranslation()
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MonitorXIcon className="size-5" />
          {t.login.desktopRequiredTitle}
        </CardTitle>
        <CardDescription>{t.login.desktopRequiredDescription}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function SetupCard({
  onCreate,
}: {
  onCreate: (input: { name: string; email: string; password: string }) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError(t.account.passwordTooShort)
      return
    }
    if (password !== confirm) {
      setError(t.account.passwordMismatch)
      return
    }
    await onCreate({ name, email, password })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t.login.setupTitle}</CardTitle>
        <CardDescription>{t.login.setupDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="setup-name">{t.account.name}</FieldLabel>
              <Input id="setup-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="setup-email">{t.login.email}</FieldLabel>
              <Input
                id="setup-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="setup-password">{t.login.password}</FieldLabel>
              <Input
                id="setup-password"
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError("")
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="setup-confirm">
                {t.account.confirmNewPassword}
              </FieldLabel>
              <Input
                id="setup-confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setError("")
                }}
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              {t.login.setupSubmit}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function LoginCard({
  onLogin,
}: {
  onLogin: (email: string, password: string) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await onLogin(email, password)
    if (!ok) setError(true)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t.login.title}</CardTitle>
        <CardDescription>{t.login.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="login-email">{t.login.email}</FieldLabel>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(false)
                }}
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="login-password">
                  {t.login.password}
                </FieldLabel>
                <ForgotPasswordDialog />
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(false)
                }}
              />
            </Field>

            {error ? (
              <p className="text-sm text-destructive">
                {t.login.invalidCredentials}
              </p>
            ) : null}

            <Button type="submit" className="w-full">
              {t.login.submit}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
