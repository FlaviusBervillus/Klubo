const https = require("https")
const db = require("./db")

const HOST = "bankaccountdata.gocardless.com"

function request(method, path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const headers = { "Content-Type": "application/json", Accept: "application/json" }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload)

    const req = https.request(
      { hostname: HOST, path, method, headers, timeout: 15000 },
      (res) => {
        let data = ""
        res.on("data", (chunk) => (data += chunk))
        res.on("end", () => {
          try {
            const json = data ? JSON.parse(data) : {}
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json)
            } else {
              reject(new Error(json.detail || json.summary || `HTTP ${res.statusCode}`))
            }
          } catch {
            reject(new Error("Réponse GoCardless invalide"))
          }
        })
      },
    )
    req.on("timeout", () => req.destroy(new Error("Délai dépassé")))
    req.on("error", reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function getAccessToken(secretId, secretKey) {
  const res = await request("POST", "/api/v2/token/new/", null, {
    secret_id: secretId,
    secret_key: secretKey,
  })
  return res.access
}

async function listInstitutions(secretId, secretKey, country) {
  const access = await getAccessToken(secretId, secretKey)
  return request("GET", `/api/v2/institutions/?country=${encodeURIComponent(country)}`, access)
}

/** Crée une requisition et renvoie le lien de consentement à ouvrir dans le vrai navigateur. */
async function startConsent(secretId, secretKey, institutionId, redirectUri) {
  const access = await getAccessToken(secretId, secretKey)
  const requisition = await request("POST", "/api/v2/requisitions/", access, {
    redirect: redirectUri,
    institution_id: institutionId,
    reference: `compta-${Date.now()}`,
  })
  return { requisitionId: requisition.id, link: requisition.link }
}

/** Récupère le solde réel d'un compte (préfère le solde disponible, sinon le dernier solde comptabilisé). */
async function fetchBalance(accountId, access) {
  const data = await request("GET", `/api/v2/accounts/${accountId}/balances/`, access)
  const balances = data.balances || []
  const preferred =
    balances.find((b) => b.balanceType === "interimAvailable") ||
    balances.find((b) => b.balanceType === "closingBooked") ||
    balances[0]
  if (!preferred?.balanceAmount) return null
  return {
    amount: Number(preferred.balanceAmount.amount),
    currency: preferred.balanceAmount.currency,
  }
}

/** À appeler après le retour de consentement : récupère les comptes, les transactions et le solde réels. */
async function completeSync(secretId, secretKey, requisitionId) {
  const access = await getAccessToken(secretId, secretKey)
  const requisition = await request("GET", `/api/v2/requisitions/${requisitionId}/`, access)

  let total = 0
  let balanceTotal = 0
  let balanceCurrency = null
  for (const accountId of requisition.accounts || []) {
    const tx = await request("GET", `/api/v2/accounts/${accountId}/transactions/`, access)
    const booked = tx.transactions?.booked || []
    const rows = booked.map((t) => ({
      id: `gc_${t.transactionId || t.internalTransactionId}`,
      accountId,
      date: t.bookingDate,
      description: t.remittanceInformationUnstructured || t.additionalInformation || "",
      amount: Number(t.transactionAmount?.amount || 0),
      rawJson: JSON.stringify(t),
    }))
    db.insertBankTransactions(rows)
    total += rows.length

    const balance = await fetchBalance(accountId, access)
    if (balance) {
      balanceTotal += balance.amount
      balanceCurrency = balance.currency
    }
  }
  db.setSyncState("gocardless", new Date().toISOString())
  if (balanceCurrency) {
    db.setSetting(
      "gocardlessBalance",
      JSON.stringify({
        amount: balanceTotal,
        currency: balanceCurrency,
        updatedAt: new Date().toISOString(),
      }),
    )
  }
  return total
}

module.exports = { listInstitutions, startConsent, completeSync }
