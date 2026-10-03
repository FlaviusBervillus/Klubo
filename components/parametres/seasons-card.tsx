"use client"

import { useState } from "react"
import { CalendarRangeIcon, PencilIcon, PlusIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SeasonFormDialog } from "@/components/season-switcher"
import { useSeasons, type Season } from "@/lib/seasons-store"
import { useTranslation } from "@/lib/i18n/context"
import { formatDate } from "@/lib/mock-data"

export function SeasonsCard() {
  const { t } = useTranslation()
  const { seasons, activeSeasonId } = useSeasons()
  const [dialogState, setDialogState] = useState<{ open: boolean; season: Season | null }>({
    open: false,
    season: null,
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <CalendarRangeIcon className="size-4" />
              {t.seasons.allTime}
            </CardTitle>
            <CardDescription>{t.seasons.cardSubtitle}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogState({ open: true, season: null })}
          >
            <PlusIcon data-icon="inline-start" />
            {t.seasons.new}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {seasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.seasons.none}</p>
        ) : (
          seasons.map((season) => (
            <div
              key={season.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{season.label}</span>
                {season.id === activeSeasonId ? (
                  <Badge variant="outline" className="text-xs font-normal">
                    {t.seasons.activeBadge}
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatDate(season.startDate)} – {formatDate(season.endDate)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.seasons.edit}
                onClick={() => setDialogState({ open: true, season })}
              >
                <PencilIcon />
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <SeasonFormDialog
        season={dialogState.season}
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
      />
    </Card>
  )
}
