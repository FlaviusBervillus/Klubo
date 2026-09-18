"use client"

import { useEffect, useState } from "react"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export type CredentialField = {
  key: string
  label: string
  placeholder?: string
  type?: "text" | "password"
  description?: string
}

export function ApiCredentialsDialog({
  title,
  description,
  fields,
  values,
  onSave,
  trigger,
}: {
  title: string
  description: string
  fields: CredentialField[]
  values: Record<string, string>
  onSave: (next: Record<string, string>) => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(values)

  useEffect(() => {
    if (open) setDraft(values)
  }, [open, values])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave(draft)
    setOpen(false)
    toast.success("Identifiants enregistrés", {
      description: "Chiffrés dans le coffre-fort local.",
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button variant="outline" className="w-full">
              <KeyRoundIcon data-icon="inline-start" />
              Configurer les clés API
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            {fields.map((f) => (
              <Field key={f.key}>
                <FieldLabel htmlFor={`cred-${f.key}`}>{f.label}</FieldLabel>
                <Input
                  id={`cred-${f.key}`}
                  type={f.type ?? "password"}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  value={draft[f.key] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                  }
                />
                {f.description ? (
                  <FieldDescription>{f.description}</FieldDescription>
                ) : null}
              </Field>
            ))}
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Annuler
                </Button>
              }
            />
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
