"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/lib/auth-context"
import { Skeleton } from "@/components/ui/skeleton"
import { normalizePathname } from "@/lib/utils"

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loaded } = useAuth()
  const pathname = normalizePathname(usePathname())
  const router = useRouter()
  const isLoginPage = pathname === "/login"

  useEffect(() => {
    if (!loaded) return
    if (!session && !isLoginPage) {
      router.replace("/login")
    } else if (session && isLoginPage) {
      router.replace("/")
    }
  }, [loaded, session, isLoginPage, router])

  if (!loaded) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-8 w-40" />
      </div>
    )
  }

  if ((!session && !isLoginPage) || (session && isLoginPage)) {
    return null
  }

  return <>{children}</>
}
