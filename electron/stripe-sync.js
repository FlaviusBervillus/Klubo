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
    if (charge.status !== "succeeded") continue
    const bt =
      charge.balance_transaction && typeof charge.balance_transaction === "object"
        ? charge.balance_transaction
        : null

    db.upsertTransactionByChargeId({
      id: `stripe_${charge.id}`,
      date: new Date(charge.created * 1000).toISOString(),
      description: charge.description || "Paiement Stripe",
      member: charge.billing_details?.name || null,
      method: "stripe",
      type: "entree",
      amount: charge.amount / 100,
      status: charge.disputed ? "en_attente" : "a_categoriser",
      stripePaymentIntentId: charge.payment_intent || null,
      stripeChargeId: charge.id,
      stripeFee: bt ? bt.fee / 100 : null,
      stripeNet: bt ? bt.net / 100 : null,
      stripeRawJson: JSON.stringify(charge),
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
  // Reflétés via charge.refunded lors de l'import des charges ; comptés ici pour le rapport de synchronisation.
  const refunds = await paginate("/v1/refunds", secretKey)
  return refunds.length
}

async function syncAll(secretKey) {
  const customers = await syncCustomers(secretKey)
  const charges = await syncCharges(secretKey)
  const refunds = await syncRefunds(secretKey)
  const disputes = await syncDisputes(secretKey)
  const subscriptions = await syncSubscriptions(secretKey)
  db.setSyncState("stripe", new Date().toISOString())
  return { customers, charges, refunds, disputes, subscriptions }
}

module.exports = { syncAll }
