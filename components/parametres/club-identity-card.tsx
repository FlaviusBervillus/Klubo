"use client"

import { useEffect, useRef, useState } from "react"
import { ImageUpIcon, SwordIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

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
import { useClubSettings } from "@/lib/club-settings"
import { useTranslation } from "@/lib/i18n/context"

export function ClubIdentityCard() {
  const { t } = useTranslation()
  const { settings, update } = useClubSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(settings.name)
  const [season, setSeason] = useState(settings.season)
  const [stripeAccountName, setStripeAccountName] = useState(
    settings.stripeAccountName,
  )
  const [address, setAddress] = useState(settings.address)
  const [phone, setPhone] = useState(settings.phone)
  const [rna, setRna] = useState(settings.rna)

  useEffect(() => {
    setName(settings.name)
    setSeason(settings.season)
    setStripeAccountName(settings.stripeAccountName)
    setAddress(settings.address)
    setPhone(settings.phone)
    setRna(settings.rna)
  }, [settings.name, settings.season, settings.stripeAccountName, settings.address, settings.phone, settings.rna])

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      update({ logoUrl: String(reader.result) })
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await update({ name, season, stripeAccountName, address, phone, rna })
    toast.success(t.settings.identitySaved)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.clubIdentityTitle}</CardTitle>
        <CardDescription>{t.settings.clubIdentitySubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 sm:flex-row">
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logoUrl}
                  alt={settings.name}
                  className="size-full object-cover"
                />
              ) : (
                <SwordIcon className="size-8 text-muted-foreground" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageUpIcon data-icon="inline-start" />
              {t.settings.changeLogo}
            </Button>
            {settings.logoUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => update({ logoUrl: null })}
              >
                <XIcon data-icon="inline-start" />
                {t.settings.removeLogo}
              </Button>
            ) : null}
          </div>

          <FieldGroup className="flex-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="club-name">
                  {t.settings.fieldClubName}
                </FieldLabel>
                <Input
                  id="club-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="club-season">
                  {t.settings.fieldSeason}
                </FieldLabel>
                <Input
                  id="club-season"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="Saison 2026 — 2027"
                  required
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="club-stripe-name">
                {t.settings.fieldStripeAccountName}
              </FieldLabel>
              <Input
                id="club-stripe-name"
                value={stripeAccountName}
                onChange={(e) => setStripeAccountName(e.target.value)}
                placeholder="USJA Kung-Fu — Cotisations"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="club-address">
                  {t.settings.fieldAddress}
                </FieldLabel>
                <Input
                  id="club-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="14 Rue Louis Armand, 44470 Carquefou"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="club-phone">
                  {t.settings.fieldPhone}
                </FieldLabel>
                <Input
                  id="club-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+33 6 79 81 95 05"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="club-rna">{t.settings.fieldRna}</FieldLabel>
              <Input
                id="club-rna"
                value={rna}
                onChange={(e) => setRna(e.target.value)}
                placeholder="W442029842"
              />
            </Field>
            <Button type="submit" className="w-fit">
              {t.common.save}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
