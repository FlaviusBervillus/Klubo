"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { useTranslation } from "@/lib/i18n/context"

type Step = "email" | "answer" | "none" | "done"

export function ForgotPasswordDialog() {
  const { t } = useTranslation()
  const { getSecurityQuestion, resetPasswordWithAnswer } = useAuth()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")

  function reset() {
    setStep("email")
    setEmail("")
    setQuestion("")
    setAnswer("")
    setNewPassword("")
    setConfirmPassword("")
    setError("")
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = await getSecurityQuestion(email)
    if (!q) {
      setStep("none")
      return
    }
    setQuestion(q)
    setStep("answer")
  }

  async function handleAnswerSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setError(t.account.passwordTooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t.account.passwordMismatch)
      return
    }
    const ok = await resetPasswordWithAnswer(email, answer, newPassword)
    if (!ok) {
      setError(t.login.forgotWrongAnswer)
      return
    }
    setStep("done")
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
          <Button type="button" variant="link" className="h-auto p-0 text-xs">
            {t.login.forgotPassword}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.login.forgotTitle}</DialogTitle>
          {step === "email" ? (
            <DialogDescription>{t.login.forgotEmailStep}</DialogDescription>
          ) : null}
        </DialogHeader>

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="forgot-email">{t.login.email}</FieldLabel>
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full">
                {t.login.continueLabel}
              </Button>
            </FieldGroup>
          </form>
        ) : null}

        {step === "none" ? (
          <p className="text-sm text-muted-foreground">{t.login.forgotNoQuestion}</p>
        ) : null}

        {step === "answer" ? (
          <form onSubmit={handleAnswerSubmit}>
            <FieldGroup>
              <p className="text-sm font-medium">{question}</p>
              <Field>
                <FieldLabel htmlFor="forgot-answer">
                  {t.login.forgotAnswerLabel}
                </FieldLabel>
                <Input
                  id="forgot-answer"
                  required
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value)
                    setError("")
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="forgot-new-password">
                  {t.account.newPassword}
                </FieldLabel>
                <Input
                  id="forgot-new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setError("")
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="forgot-confirm-password">
                  {t.account.confirmNewPassword}
                </FieldLabel>
                <Input
                  id="forgot-confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setError("")
                  }}
                />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full">
                {t.account.changePassword}
              </Button>
            </FieldGroup>
          </form>
        ) : null}

        {step === "done" ? (
          <p className="text-sm text-success dark:text-[oklch(0.74_0.14_155)]">
            {t.login.forgotSuccess}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
