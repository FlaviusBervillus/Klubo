const { stripeRequest } = require("./stripe-client")
const db = require("./db")

async function paginate(basePath, secretKey, extraQuery = "") {
  const items = []
  let startingAfter = null
  for (;;) {
    const cursor = startingAfter ? `&starting_after=${encodeURIComponent(startingAfter)}` : ""
    const page = await stripeRequest(`${basePath}?limit=100${extraQuery}${cursor}`, secretKey)
    items.push(...page.data)
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return items
}

function splitName(customer) {
  if (customer.name) {
    const parts = customer.name.trim().split(/\s+/)
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") || "" }
  }
  return { firstName: customer.email || "Client Stripe", lastName: "" }
}

/** Devine le cours à partir de la description de la charge (ex. "Inscription USJA Kung-fu : Fitness combat"). */
function detectCourseType(description) {
  if (!description) return null
  const d = description.toLowerCase()
  if (d.includes("fitness")) return "Fitness de combat"
  if (d.includes("enfant")) return "Kung-fu Enfant"
  if (d.includes("ado")) return "Kung-fu Ado"
  if (d.includes("tai-chi") || d.includes("tai chi")) return "Tai-chi"
  if (d.includes("self")) return "Self-défense"
  if (d.includes("adulte")) return "Kung-fu Adulte"
  return null
}

async function syncCustomers(secretKey) {
  const customers = await paginate("/v1/customers", secretKey)
  for (const c of customers) {
    const { firstName, lastName } = splitName(c)
    db.upsertClientByStripeId({
      stripeCustomerId: c.id,
      firstName,
      lastName,
      email: c.email || "",
      method: "stripe",
    })
  }
  return customers.length
}

async function syncCharges(secretKey) {
  const charges = await paginate("/v1/charges", secretKey, "&expand[]=data.balance_transaction")
  let imported = 0
  for (const charge of charges) {
    const bt =
      charge.balance_transaction && typeof charge.balance_transaction === "object"
        ? charge.balance_transaction
        : null
    // On importe aussi les paiements en échec/bloqués (status != "succeeded") : le trésorier
    // a besoin de les voir (relance d'un adhérent, rapprochement avec le dashboard Stripe...).
    const failed = charge.status !== "succeeded"

    db.upsertTransactionByChargeId({
      id: `stripe_${charge.id}`,
      date: new Date(charge.created * 1000).toISOString(),
      description: charge.description || "Paiement Stripe",
      member: charge.billing_details?.name || null,
      method: "stripe",
      type: "entree",
      amount: charge.amount / 100,
      status: failed ? "echec" : charge.disputed ? "en_attente" : "a_categoriser",
      stripePaymentIntentId: charge.payment_intent || null,
      stripeChargeId: charge.id,
      stripeFee: bt ? bt.fee / 100 : null,
      stripeNet: bt ? bt.net / 100 : null,
      stripeRawJson: JSON.stringify(charge),
    })

    if (!failed && charge.amount_refunded > 0) {
      // Stripe ne rembourse jamais ses propres frais : le montant net réellement conservé
      // par le club est le montant restant après remboursement, moins ce frais d'origine.
      const grossKept = (charge.amount - charge.amount_refunded) / 100
      const netKept = bt ? grossKept - bt.fee / 100 : grossKept
      db.updateTransaction(`stripe_${charge.id}`, {
        status: charge.refunded ? "remboursee" : "remboursee_partiellement",
        amount: grossKept,
        stripeNet: netKept,
      })
    }

    if (!failed) {
      const courseType = detectCourseType(charge.description)
      if (charge.customer) {
        db.applyDetectedCourseType({ stripeCustomerId: charge.customer, courseType })
      } else if (charge.billing_details?.name || charge.billing_details?.email || charge.receipt_email) {
        // Stripe ne renseigne pas toujours billing_details.email (ex. saisie carte sans reçu) :
        // on retombe sur receipt_email, puis, à défaut, on déduplique par nom (voir findGuestClient).
        const email = charge.billing_details?.email || charge.receipt_email || ""
        const { firstName, lastName } = splitName({ name: charge.billing_details?.name, email })
        db.upsertGuestClient({
          firstName,
          lastName,
          email,
          method: "stripe",
          ...(courseType ? { status: courseType } : {}),
        })
        db.applyDetectedCourseType({ email, firstName, lastName, courseType })
      }
    }
    imported++
  }
  return imported
}

/** Tentatives de paiement annulées/bloquées avant même la création d'une charge (aucun Charge Stripe associé). */
async function syncFailedIntents(secretKey) {
  const intents = await paginate("/v1/payment_intents", secretKey)
  let imported = 0
  for (const pi of intents) {
    if (pi.status === "succeeded" || !pi.amount) continue
    const hasCharge = !!(pi.latest_charge || pi.charges?.data?.length)
    if (hasCharge) continue // déjà couvert par syncCharges, qui a son propre objet Charge
    db.upsertTransactionById({
      id: `pi_${pi.id}`,
      date: new Date(pi.created * 1000).toISOString(),
      description: pi.description || "Tentative de paiement Stripe",
      member: null,
      method: "stripe",
      category: null,
      type: "entree",
      amount: pi.amount / 100,
      status: "echec",
      stripePaymentIntentId: pi.id,
      stripeChargeId: null,
      stripeRawJson: JSON.stringify(pi),
    })
    imported++
  }
  return imported
}

async function syncDisputes(secretKey) {
  const disputes = await paginate("/v1/disputes", secretKey)
  for (const dispute of disputes) {
    db.updateTransaction(`stripe_${dispute.charge}`, { status: "en_attente" })
  }
  return disputes.length
}

async function syncSubscriptions(secretKey) {
  const subs = await paginate("/v1/subscriptions", secretKey, "&status=all")
  return subs.length
}

async function syncRefunds(secretKey) {
  // Le statut (et le montant net conservé par le club) sont déjà mis à jour dans syncCharges
  // via charge.amount_refunded / charge.refunded ; on compte juste ici pour le rapport.
  const refunds = await paginate("/v1/refunds", secretKey)
  return refunds.length
}

async function syncAll(secretKey) {
  const customers = await syncCustomers(secretKey)
  const charges = await syncCharges(secretKey)
  const failedIntents = await syncFailedIntents(secretKey)
  const refunds = await syncRefunds(secretKey)
  const disputes = await syncDisputes(secretKey)
  const subscriptions = await syncSubscriptions(secretKey)
  db.setSyncState("stripe", new Date().toISOString())
  return { customers, charges: charges + failedIntents, refunds, disputes, subscriptions }
}

module.exports = { syncAll }
