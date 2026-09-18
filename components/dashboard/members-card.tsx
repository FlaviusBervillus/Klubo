"use client"

import { UsersIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useClientsStore } from "@/lib/clients-store"
import { useTranslation } from "@/lib/i18n/context"
import { ALL_COURSE_TYPES, type CourseType } from "@/lib/mock-data"

const dotColors: Record<CourseType, string> = {
  "Kung-fu Adulte": "bg-[oklch(0.55_0.13_265)]",
  "Kung-fu Ado": "bg-[oklch(0.6_0.1_200)]",
  "Kung-fu Enfant": "bg-success",
  "Fitness de combat": "bg-warning",
  "Tai-chi": "bg-muted-foreground",
  "Self-défense": "bg-destructive",
  "Non catégorisé": "bg-border",
}

export function MembersCard() {
  const { t } = useTranslation()
  const { clients } = useClientsStore()

  const counts = ALL_COURSE_TYPES
    .map((status) => ({
      status,
      count: clients.filter((c) => c.status === status).length,
    }))
    .filter((c) => c.count > 0)

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <UsersIcon className="size-4" />
          {t.dashboard.membersTitle}
        </CardDescription>
        <CardTitle className="font-mono text-3xl tabular-nums">
          {clients.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t.dashboard.membersSubtitle}
        </p>
        <ul className="flex flex-col gap-1.5">
          {counts.map((c) => (
            <li key={c.status} className="flex items-center gap-2 text-sm">
              <span
                className={`size-2.5 shrink-0 rounded-full ${dotColors[c.status]}`}
              />
              <span className="flex-1 truncate text-muted-foreground">
                {t.courseTypes[c.status]}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {c.count}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
