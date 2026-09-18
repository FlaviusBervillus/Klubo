import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { AppShell } from "@/components/app-shell"
import { AuthGate } from "@/components/auth-gate"
import { VaultUnlockPrompt } from "@/components/vault-unlock-prompt"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/lib/auth-context"
import { ClientsProvider } from "@/lib/clients-store"
import { ClubSettingsProvider } from "@/lib/club-settings"
import { LocaleProvider } from "@/lib/i18n/context"
import { SecureVaultProvider } from "@/lib/secure-vault"
import { TransactionsProvider } from "@/lib/transactions-store"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-numbers",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Compta Kung-Fu — Gestion du club",
  description:
    "Logiciel de comptabilité pour club de kung-fu : suivi des transactions, rapprochement bancaire, rapports et sauvegardes.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1614" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleProvider>
            <ClubSettingsProvider>
              <SecureVaultProvider>
                <TransactionsProvider>
                  <ClientsProvider>
                    <AuthProvider>
                      <AuthGate>
                        <AppShell>{children}</AppShell>
                        <VaultUnlockPrompt />
                      </AuthGate>
                      <Toaster position="top-right" />
                    </AuthProvider>
                  </ClientsProvider>
                </TransactionsProvider>
              </SecureVaultProvider>
            </ClubSettingsProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
