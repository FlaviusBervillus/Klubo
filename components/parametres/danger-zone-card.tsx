"use client"

import { useState } from "react"
import { Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useTranslation } from "@/lib/i18n/context"

const CONFIRM_WORD = "SUPPRIMER"

function api() {
  return typeof window !== "undefined" ? window.electronAPI : undefined
}

export function DangerZoneCard() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)

  async function handleReset() {
    const electronApi = api()
    if (!electronApi) {
      toast.error(t.settings.electronOnlyFeature)
      return
    }
    setBusy(true)
    // L'app se ferme et relance toute seule une fois les données supprimées : pas de suite à gérer ici.
    await electronApi.resetAppData()
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlertIcon className="size-4" />
          {t.settings.dangerZoneTitle}
        </CardTitle>
        <CardDescription>{t.settings.dangerZoneSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) setConfirmText("")
          }}
        >
          <DialogTrigger
            render={
              <Button variant="destructive">
                <Trash2Icon data-icon="inline-start" />
                {t.settings.resetAppButton}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t.settings.resetAppConfirmTitle}</DialogTitle>
              <DialogDescription>{t.settings.resetAppConfirmDescription}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="reset-confirm">
                {t.settings.resetAppConfirmLabel.replace("{word}", CONFIRM_WORD)}
              </FieldLabel>
              <Input
                id="reset-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                placeholder={CONFIRM_WORD}
              />
              <FieldDescription>{t.settings.resetAppConfirmHint}</FieldDescription>
            </Field>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">{t.common.cancel}</Button>} />
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={confirmText !== CONFIRM_WORD || busy}
              >
                {busy ? t.settings.resetAppInProgress : t.settings.resetAppButton}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
