const { BrowserWindow } = require("electron")

const METHOD_LABELS = {
  especes: "Espèces",
  cheque: "Chèque",
  virement: "Virement bancaire",
  stripe: "Carte Bancaire",
}

function formatEuro(amount) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatLongDate(isoDate) {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(isoDate))
  return formatted.replace(/ (\p{L})/u, (_, letter) => ` ${letter.toUpperCase()}`)
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
}

function paymentMethodLine(tx) {
  if (tx.method === "stripe") {
    let card = null
    try {
      card = tx.stripe_raw_json ? JSON.parse(tx.stripe_raw_json)?.payment_method_details?.card : null
    } catch {
      card = null
    }
    return card?.last4 ? `Carte Bancaire •••• ${card.last4}` : METHOD_LABELS.stripe
  }
  return METHOD_LABELS[tx.method] || tx.method
}

const COUNTRY_NAMES = { FR: "France" }

/** Adresse/e-mail facturé : priorité à ce que le trésorier a saisi lui-même sur la fiche client (plus fiable), sinon ce que Stripe a transmis avec la charge. */
function billingAddressLines(tx, client) {
  const lines = []
  if (client?.address) {
    lines.push(...client.address.split(",").map((part) => escapeHtml(part.trim())).filter(Boolean))
  }
  let billing = null
  if (tx.method === "stripe" && tx.stripe_raw_json) {
    try {
      billing = JSON.parse(tx.stripe_raw_json)?.billing_details
    } catch {
      billing = null
    }
  }
  if (lines.length === 0 && billing?.address) {
    const address = billing.address
    if (address.line1) lines.push(escapeHtml(address.line1))
    const cityLine = [address.postal_code, address.city].filter(Boolean).join(" ")
    if (cityLine) lines.push(escapeHtml(cityLine))
    if (address.country) lines.push(escapeHtml(COUNTRY_NAMES[address.country] || address.country))
  }
  const email = client?.email || billing?.email
  if (email) lines.push(escapeHtml(email))
  return lines
}

/** Montant brut d'origine et montant remboursé, lus dans la charge Stripe brute (tx.amount ne
 * reflète que ce qu'il reste après un éventuel remboursement, voir stripe-sync.js). */
function refundInfo(tx) {
  if (tx.method !== "stripe" || !tx.stripe_raw_json) return { originalGross: tx.amount, refunded: 0 }
  try {
    const charge = JSON.parse(tx.stripe_raw_json)
    return {
      originalGross: charge.amount != null ? charge.amount / 100 : tx.amount,
      refunded: charge.amount_refunded ? charge.amount_refunded / 100 : 0,
    }
  } catch {
    return { originalGross: tx.amount, refunded: 0 }
  }
}

function renderInvoiceHtml(tx, club, client) {
  const memberName = client ? `${client.first_name} ${client.last_name}`.trim() : tx.member || "Client"
  const addressLines = billingAddressLines(tx, client)
  const clubAddressLines = club.address
    ? club.address.split(",").map((part) => part.trim()).filter(Boolean)
    : []
  const { originalGross, refunded } = refundInfo(tx)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; padding: 48px; font-size: 13px; }
  h1 { font-size: 26px; margin: 0 0 32px 0; }
  .top-row { display: flex; justify-content: space-between; align-items: flex-start; }
  .meta-row { margin-bottom: 24px; }
  .meta-label { font-weight: 600; }
  .columns { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 24px; }
  .col { flex: 1; line-height: 1.5; }
  .club-name { font-weight: 600; }
  .handle { display: inline-block; background: #f1f1f1; border-radius: 999px; padding: 1px 8px; font-size: 11px; margin-left: 6px; }
  .logo { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
  .banner { font-weight: 600; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead th { text-align: left; font-size: 11px; color: #666; font-weight: 400; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  thead th.num { text-align: right; }
  tbody td { padding: 10px 0; border-bottom: 1px solid #eee; }
  tbody td.num { text-align: right; }
  .totals { margin-top: 8px; width: 260px; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; }
  .totals .paid { font-weight: 700; border-bottom: none; margin-top: 4px; }
  .rna { margin-top: 32px; color: #444; }
  .sign-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 48px; }
  .sign-block { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .signature { max-height: 60px; max-width: 160px; object-fit: contain; }
  .sign-label { font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 4px; width: 160px; text-align: center; }
  .stamp { max-height: 90px; max-width: 90px; object-fit: contain; }
  .footer { position: fixed; bottom: 24px; left: 48px; right: 48px; border-top: 1px solid #ddd; padding-top: 8px; text-align: right; font-size: 11px; color: #888; }
</style>
</head>
<body>
  <div class="top-row">
    <h1>Facture</h1>
    ${club.logoUrl ? `<img class="logo" src="${club.logoUrl}" alt="" />` : ""}
  </div>

  <div class="meta-row">
    <span class="meta-label">Date de la facture</span> &nbsp; ${formatLongDate(tx.date)}
  </div>

  <div class="columns">
    <div class="col">
      <div class="club-name">${escapeHtml(club.name)}</div>
      ${clubAddressLines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
      ${club.phone ? `<div>${escapeHtml(club.phone)}</div>` : ""}
    </div>
    <div class="col">
      <div class="meta-label">Facturer à</div>
      <div>${escapeHtml(memberName)}</div>
      ${addressLines.map((l) => `<div>${l}</div>`).join("")}
    </div>
  </div>

  <div class="banner">
    Facture acquittée le ${formatLongDate(tx.date)} — Règlement déjà effectué via ${escapeHtml(paymentMethodLine(tx))}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qté</th>
        <th class="num">Prix unitaire</th>
        <th class="num">Montant</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(tx.description)}</td>
        <td class="num">1</td>
        <td class="num">${formatEuro(originalGross)}</td>
        <td class="num">${formatEuro(originalGross)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div><span>Sous-total</span><span>${formatEuro(originalGross)}</span></div>
    ${refunded > 0 ? `<div><span>Remboursement</span><span>− ${formatEuro(refunded)}</span></div>` : ""}
    <div><span>Total</span><span>${formatEuro(tx.amount)}</span></div>
    <div class="paid"><span>Montant payé</span><span>${formatEuro(tx.amount)}</span></div>
  </div>

  ${club.rna ? `<div class="rna">RNA : ${escapeHtml(club.rna)}</div>` : ""}

  ${
    club.stampUrl || club.signatureUrl
      ? `<div class="sign-row">
          <div class="sign-block">
            ${club.signatureUrl ? `<img class="signature" src="${club.signatureUrl}" alt="" />` : ""}
            <span class="sign-label">Signature</span>
          </div>
          ${club.stampUrl ? `<img class="stamp" src="${club.stampUrl}" alt="" />` : ""}
        </div>`
      : ""
  }

  <div class="footer">Page 1 sur 1</div>
</body>
</html>`
}

/** Génère un PDF de facture pour une transaction, via une fenêtre Electron cachée (webContents.printToPDF). */
async function generateReceiptPdf(tx, club, client) {
  const html = renderInvoiceHtml(tx, club, client)
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    win.destroy()
  }
}

module.exports = { generateReceiptPdf, renderInvoiceHtml }
