"use client"

import { AccountingReport } from "@/components/rapports/accounting-report"
import { FinancialReport } from "@/components/rapports/financial-report"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslation } from "@/lib/i18n/context"

export default function RapportsPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 print:hidden">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t.reports.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.reports.subtitle}</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="print:hidden">
          <TabsTrigger value="overview">{t.reports.tabOverview}</TabsTrigger>
          <TabsTrigger value="accounting">{t.reports.tabAccounting}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <FinancialReport />
        </TabsContent>
        <TabsContent value="accounting">
          <AccountingReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}
