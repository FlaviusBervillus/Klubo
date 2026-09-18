"use client"

import { useRouter } from "next/navigation"
import { PlusIcon, RefreshCwIcon, CloudUploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AddTransactionDialog } from "@/components/add-transaction-dialog"
import { useTranslation } from "@/lib/i18n/context"

export function QuickActions() {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.dashboard.quickActionsTitle}</CardTitle>
        <CardDescription>{t.dashboard.quickActionsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <AddTransactionDialog
          trigger={
            <Button variant="outline" className="w-full justify-start">
              <PlusIcon data-icon="inline-start" />
              {t.dashboard.addManualTransaction}
            </Button>
          }
        />
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => router.push("/transactions?statut=a_categoriser")}
        >
          <RefreshCwIcon data-icon="inline-start" />
          {t.dashboard.bankReconciliation}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => router.push("/parametres")}
        >
          <CloudUploadIcon data-icon="inline-start" />
          {t.dashboard.launchBackup}
        </Button>
      </CardContent>
    </Card>
  )
}
