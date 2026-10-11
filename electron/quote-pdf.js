const { BrowserWindow } = require("electron")

function formatEuro(amount) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatLongDate(isoDate) {
  if (!isoDate) return ""
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

/** Texte libre multi-lignes saisi par le trésorier -> une div par ligne (lignes vides ignorées). */
function linesHtml(text) {
  return String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("")
}

/** Même gabarit visuel que les factures (electron/invoice-pdf.js) : mêmes classes CSS, même logo
 * rond en haut à droite, même mise en page en colonnes — pour que devis et factures se ressemblent
 * à l'écran comme à l'impression. */
function renderQuoteHtml(quote, club) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const rows = items.map((item) => {
    const qty = Number(item.qty) || 0
    const unitPrice = Number(item.unitPrice) || 0
    return { ...item, qty, unitPrice, amount: qty * unitPrice }
  })
  const total = rows.reduce((sum, r) => sum + r.amount, 0)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; padding: 48px; font-size: 13px; }
  h1 { font-size: 26px; margin: 0; }
  .top-row { display: flex; justify-content: space-between; align-items: flex-start; }
  .top-row .titles { display: flex; flex-direction: column; gap: 4px; }
  .subtitle { color: #555; }
  .season { color: #888; font-size: 12px; }
  .meta-row { margin: 24px 0; display: flex; justify-content: space-between; }
  .meta-label { font-weight: 600; }
  .columns { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 24px; }
  .col { flex: 1; line-height: 1.5; }
  .club-name { font-weight: 600; }
  .logo { width: 108px; height: 108px; border-radius: 50%; object-fit: cover; }
  .info-box { background: #f6f6f6; border-radius: 8px; padding: 14px 18px; margin: 24px 0; line-height: 1.6; }
  .section-label { font-weight: 600; margin: 24px 0 8px 0; }
  .section-text { line-height: 1.6; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead th { text-align: left; font-size: 11px; color: #666; font-weight: 400; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  thead th.num { text-align: right; }
  tbody td { padding: 10px 0; border-bottom: 1px solid #eee; vertical-align: top; }
  tbody td.num { text-align: right; white-space: nowrap; }
  tbody .item-description { color: #888; font-size: 11.5px; margin-top: 2px; }
  .totals { margin-top: 8px; width: 260px; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .total { font-weight: 700; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 4px; }
  .validity { color: #888; font-size: 12px; margin: -16px 0 24px 0; }
  .legal-box { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; color: #666; font-size: 11px; line-height: 1.7; }
  .sign-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 32px; margin-top: 48px; }
  .sign-block { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 4px; }
  .signature { max-height: 60px; max-width: 160px; object-fit: contain; }
  .sign-label { font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 4px; width: 100%; text-align: center; }
  .stamp { max-height: 90px; max-width: 90px; object-fit: contain; align-self: center; }
  .footer { position: fixed; bottom: 24px; left: 48px; right: 48px; border-top: 1px solid #ddd; padding-top: 8px; text-align: right; font-size: 11px; color: #888; }
</style>
</head>
<body>
  <div class="top-row">
    <div class="titles">
      <h1>${escapeHtml(quote.title || "DEVIS")}</h1>
      ${quote.subtitle ? `<div class="subtitle">${escapeHtml(quote.subtitle)}</div>` : ""}
      ${quote.seasonLabel ? `<div class="season">${escapeHtml(quote.seasonLabel)}</div>` : ""}
    </div>
    ${club.logoUrl ? `<img class="logo" src="${club.logoUrl}" alt="" />` : ""}
  </div>

  <div class="meta-row">
    <span><span class="meta-label">Date</span> &nbsp; ${formatLongDate(quote.date)}</span>
    <span><span class="meta-label">N° du devis</span> &nbsp; ${quote.number ? escapeHtml(quote.number) : "à renseigner"}</span>
  </div>

  ${quote.validityText ? `<div class="validity">${escapeHtml(quote.validityText)}</div>` : ""}

  <div class="columns">
    <div class="col">
      <div class="meta-label">Émetteur</div>
      ${linesHtml(quote.emitterLines)}
    </div>
    <div class="col">
      <div class="meta-label">Destinataire</div>
      ${linesHtml(quote.recipientLines)}
    </div>
  </div>

  ${
    quote.infoTitle || quote.infoText
      ? `<div class="info-box">
          ${quote.infoTitle ? `<div class="club-name">${escapeHtml(quote.infoTitle)}</div>` : ""}
          ${linesHtml(quote.infoText)}
        </div>`
      : ""
  }

  ${quote.prestationTitle ? `<div class="section-label">${escapeHtml(quote.prestationTitle)}</div>` : ""}
  ${quote.prestationText ? `<div class="section-text">${escapeHtml(quote.prestationText)}</div>` : ""}

  ${
    rows.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>Désignation</th>
              <th class="num">Qté</th>
              <th class="num">Prix unitaire</th>
              <th class="num">Montant</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td>
                    ${escapeHtml(r.label)}
                    ${r.description ? `<div class="item-description">${escapeHtml(r.description)}</div>` : ""}
                  </td>
                  <td class="num">${r.qty}</td>
                  <td class="num">${formatEuro(r.unitPrice)}</td>
                  <td class="num">${formatEuro(r.amount)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>

        <div class="totals">
          <div class="total"><span>Total</span><span>${formatEuro(total)}</span></div>
        </div>`
      : ""
  }

  ${quote.termsTitle ? `<div class="section-label">${escapeHtml(quote.termsTitle)}</div>` : ""}
  ${quote.termsText ? `<div class="section-text">${escapeHtml(quote.termsText)}</div>` : ""}

  ${
    club.rna || club.siret || club.tvaMention || club.iban || club.insuranceText
      ? `<div class="legal-box">
          ${club.rna ? `<div>RNA : ${escapeHtml(club.rna)}</div>` : ""}
          ${club.siret ? `<div>SIRET : ${escapeHtml(club.siret)}</div>` : ""}
          ${club.tvaMention ? `<div>${escapeHtml(club.tvaMention)}</div>` : ""}
          ${
            club.iban
              ? `<div>Coordonnées bancaires : IBAN ${escapeHtml(club.iban)}${club.bic ? ` — BIC ${escapeHtml(club.bic)}` : ""}</div>`
              : ""
          }
          ${club.insuranceText ? `<div>${escapeHtml(club.insuranceText)}</div>` : ""}
        </div>`
      : ""
  }

  ${
    quote.signatureLeftLabel || quote.signatureRightLabel
      ? `<div class="sign-row">
          <div class="sign-block">
            <span class="sign-label">${quote.signatureLeftLabel ? escapeHtml(quote.signatureLeftLabel) : "Signature"}</span>
          </div>
          <div class="sign-block">
            ${club.stampUrl ? `<img class="stamp" src="${club.stampUrl}" alt="" />` : ""}
            ${club.signatureUrl ? `<img class="signature" src="${club.signatureUrl}" alt="" />` : ""}
            <span class="sign-label">${quote.signatureRightLabel ? escapeHtml(quote.signatureRightLabel) : "Signature"}</span>
          </div>
        </div>`
      : ""
  }

  <div class="footer">Page 1 sur 1</div>
</body>
</html>`
}

/** Génère un PDF de devis via une fenêtre Electron cachée (même mécanisme que les factures, voir invoice-pdf.js). */
async function generateQuotePdf(quote, club) {
  const html = renderQuoteHtml(quote, club)
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

module.exports = { renderQuoteHtml, generateQuotePdf }
