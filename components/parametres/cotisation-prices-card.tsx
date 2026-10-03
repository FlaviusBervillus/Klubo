"use client"

import { useEffect, useState } from "react"
import { TagsIcon } from "lucide-react"
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
import { useCotisationPrices } from "@/lib/cotisation-prices-store"
import { useTranslation } from "@/lib/i18n/context"
import { ALL_COURSE_TYPES, type CourseType } from "@/lib/mock-data"

const PRICED_COURSE_TYPES = ALL_COURSE_TYPES.filter((c) => c !== "Non catégorisé")

export function CotisationPricesCard() {
  const { t } = useTranslation()
  const { prices, setPrice, available } = useCotisationPrices()
  const [draft, setDraft] = useState<Partial<Record<CourseType, string>>>({})

  useEffect(() => {
    const next: Partial<Record<CourseType, string>> = {}
    for (const course of PRICED_COURSE_TYPES) {
      next[course] = prices[course] != null ? String(prices[course]) : ""
    }
    setDraft(next)
  }, [prices])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await Promise.all(
      PRICED_COURSE_TYPES.map((course) => {
        const value = Number(draft[course] || 0)
        return setPrice(course, value)
      }),
    )
    toast.success(t.settings.cotisationPricesSaved)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagsIcon className="size-4" />
          {t.settings.cotisationPricesTitle}
        </CardTitle>
        <CardDescription>{t.settings.cotisationPricesSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            {PRICED_COURSE_TYPES.map((course) => (
              <Field key={course}>
                <FieldLabel htmlFor={`price-${course}`}>{t.courseTypes[course]}</FieldLabel>
                <Input
                  id={`price-${course}`}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={draft[course] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [course]: e.target.value }))}
                />
              </Field>
            ))}
          </FieldGroup>
          <Button type="submit" className="w-fit" disabled={!available}>
            {t.common.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
