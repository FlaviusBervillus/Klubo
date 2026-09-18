const https = require("https")

/** Seul le process principal parle à api.stripe.com — jamais le renderer. */
function stripeRequest(path, secretKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.stripe.com",
        path,
        method: "GET",
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 15000,
      },
      (res) => {
        let body = ""
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => {
          try {
            const json = JSON.parse(body)
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json)
            } else {
              reject(new Error(json?.error?.message || `HTTP ${res.statusCode}`))
            }
          } catch {
            reject(new Error("Réponse Stripe invalide"))
          }
        })
      },
    )
    req.on("timeout", () => req.destroy(new Error("Délai dépassé")))
    req.on("error", reject)
    req.end()
  })
}

module.exports = { stripeRequest }
