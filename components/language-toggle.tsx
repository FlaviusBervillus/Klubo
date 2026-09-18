"use client"

import { GlobeIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTranslation } from "@/lib/i18n/context"
import type { Locale } from "@/lib/i18n/dictionary"

const options: { value: Locale; label: string }[] = [
  { value: "fr", label: "FR" },
  { value: "en", label: "EN" },
]

export function LanguageToggle() {
  const { locale, setLocale, t } = useTranslation()

  return (
    <Select
      items={options}
      value={locale}
      onValueChange={(v) => v && setLocale(v as Locale)}
    >
      <SelectTrigger
        size="sm"
        aria-label={t.header.language}
        className="w-auto gap-1"
      >
        <GlobeIcon className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
