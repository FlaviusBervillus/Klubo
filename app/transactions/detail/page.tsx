import { Suspense } from "react"

import { TransactionDetailView } from "@/components/transactions/transaction-detail-view"
import { Skeleton } from "@/components/ui/skeleton"

export default function TransactionDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TransactionDetailView />
    </Suspense>
  )
}
