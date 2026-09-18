export {}

export interface DbUser {
  id: string
  name: string
  email: string
  role: string
  security_question: string | null
}

export interface ReceiptOverrides {
  clientId: string | null
  firstName: string
  lastName: string
  email: string
  address: string
}

export interface DbClient {
  id: string
  stripe_customer_id: string | null
  first_name: string
  last_name: string
  email: string
  address: string
  status: string
  method: string
  paid: number
}

export interface DbTransaction {
  id: string
  date: string
  description: string
  member: string | null
  method: string
  category: string | null
  type: string
  amount: number
  status: string
  justificatif_type: string | null
  justificatif_name: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  stripe_fee: number | null
  stripe_net: number | null
  stripe_raw_json: string | null
}

export interface DbBankTransaction {
  id: string
  gocardless_account_id: string
  date: string
  description: string | null
  amount: number
  raw_json: string | null
}

export interface VaultRow {
  salt_b64: string
  iv_b64: string
  ciphertext_b64: string
}

declare global {
  interface Window {
    /** Exposé par electron/preload.js — absent dans la version web statique. */
    electronAPI?: {
      db: {
        getUsers: () => Promise<DbUser[]>
        countUsers: () => Promise<number>
        findUserByEmail: (email: string) => Promise<(DbUser & { password_hash: string; security_answer_hash: string | null }) | null>
        createUser: (user: Record<string, unknown>) => Promise<void>
        updateUser: (id: string, patch: Record<string, unknown>) => Promise<void>
        deleteUser: (id: string) => Promise<void>

        getClients: () => Promise<DbClient[]>
        createClient: (client: Record<string, unknown>) => Promise<void>
        updateClient: (id: string, patch: Record<string, unknown>) => Promise<void>
        deleteClient: (id: string) => Promise<void>

        getTransactions: () => Promise<DbTransaction[]>
        createTransaction: (tx: Record<string, unknown>) => Promise<void>
        updateTransaction: (id: string, patch: Record<string, unknown>) => Promise<void>

        getBankTransactions: () => Promise<DbBankTransaction[]>

        getSettings: () => Promise<Record<string, string>>
        setSetting: (key: string, value: string) => Promise<void>
        getSyncState: (
          provider: string,
        ) => Promise<{ cursor: string | null; last_synced_at: string } | null>
      }
      vault: {
        read: () => Promise<VaultRow | null>
        write: (payload: VaultRow) => Promise<void>
      }
      prepareReceipt: (transactionId: string) => Promise<
        | {
            ok: true
            tx: { id: string; description: string; amount: number; date: string; method: string }
            client: DbClient | null
          }
        | { ok: false; error?: string }
      >
      renderReceiptPreview: (
        transactionId: string,
        overrides?: ReceiptOverrides,
      ) => Promise<{ ok: true; html: string } | { ok: false; error?: string }>
      downloadReceipt: (
        transactionId: string,
        overrides?: ReceiptOverrides,
      ) => Promise<{ ok: true; path: string } | { ok: false; error?: string; canceled?: boolean }>
      testStripeConnection: (secretKey: string) => Promise<
        | { ok: true; available: { amount: number; currency: string }[] }
        | { ok: false; error: string }
      >
      syncStripe: (secretKey: string) => Promise<
        | { ok: true; customers: number; charges: number; refunds: number; disputes: number; subscriptions: number }
        | { ok: false; error: string }
      >
      gocardless: {
        listInstitutions: (
          secretId: string,
          secretKey: string,
          country: string,
        ) => Promise<{ ok: true; institutions: { id: string; name: string }[] } | { ok: false; error: string }>
        startConsent: (
          secretId: string,
          secretKey: string,
          institutionId: string,
        ) => Promise<{ ok: true; requisitionId: string } | { ok: false; error: string }>
        completeSync: (
          secretId: string,
          secretKey: string,
          requisitionId: string,
        ) => Promise<{ ok: true; count: number } | { ok: false; error: string }>
        onCallback: (listener: (requisitionId: string) => void) => () => void
      }
      mega: {
        backup: (
          email: string,
          password: string,
        ) => Promise<{ ok: true; fileName: string; size: number } | { ok: false; error: string }>
        listBackups: (
          email: string,
          password: string,
        ) => Promise<
          | { ok: true; backups: { id: string; name: string; size: number; timestamp: number }[] }
          | { ok: false; error: string }
        >
        restore: (
          email: string,
          password: string,
          fileId: string,
        ) => Promise<{ ok: true } | { ok: false; error: string }>
      }
    }
  }
}
