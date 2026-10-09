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

function renderQuoteHtml(quote, club) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const rows = items.map((item) => {
    const qty = Number(item.qty) || 0
    const unitPrice = Number(item.unitPrice) || 0
    const amount = qty * unitPrice
    return { ...item, qty, unitPrice, amount }
  })
  const total = rows.reduce((sum, r) => sum + r.amount, 0)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; font-size: 13px; margin: 0; }
  .page { padding: 0 0 48px 0; }
  .header { background: #15293e; color: #fff; padding: 36px 48px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header h1 { font-size: 28px; margin: 0; letter-spacing: 0.5px; }
  .header .doc-title { font-size: 28px; font-weight: 700; letter-spacing: 1px; }
  .header .subtitle { margin-top: 6px; font-size: 14px; color: #cdd7e1; }
  .header .season { margin-top: 2px; font-size: 13px; color: #9fb0c3; }
  .body { padding: 24px 48px 0 48px; }
  .meta-row { display: flex; justify-content: space-between; font-size: 12.5px; color: #333; margin-bottom: 20px; }
  .columns { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 20px; }
  .col { flex: 1; line-height: 1.5; }
  .col-title { color: #0f7173; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; margin-bottom: 6px; }
  .col .name { font-weight: 700; margin-bottom: 2px; }
  .info-box { background: #eef3f6; border-radius: 6px; padding: 16px 20px; margin-bottom: 20px; }
  .info-box .col-title { margin-bottom: 8px; }
  .info-box .info-name { font-weight: 700; margin-bottom: 4px; }
  .section-title { color: #0f7173; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; margin-bottom: 6px; }
  .prestation-dates { font-weight: 700; margin-bottom: 8px; }
  .prestation-text { line-height: 1.6; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th { text-align: left; background: #15293e; color: #fff; font-size: 11px; font-weight: 600; padding: 10px 12px; }
  thead th.num { text-align: right; }
  tbody td { padding: 12px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  tbody td.num { text-align: right; white-space: nowrap; }
  tbody .item-label { font-weight: 700; }
  tbody .item-description { color: #666; font-size: 12px; margin-top: 2px; }
  .total-row { display: flex; justify-content: flex-end; margin: 16px 0 24px 0; }
  .total-badge { display: flex; align-items: center; gap: 24px; background: #0f7173; color: #fff; border-radius: 6px; padding: 10px 20px; font-weight: 700; }
  .total-badge .amount { font-size: 18px; }
  .terms-text { line-height: 1.6; margin-bottom: 32px; white-space: pre-wrap; }
  .sign-row { display: flex; justify-content: space-between; gap: 32px; margin-top: 16px; }
  .sign-col { flex: 1; }
  .sign-col .label { font-weight: 700; margin-bottom: 24px; }
  .sign-col .hint { color: #666; font-size: 12px; }
  .footer { padding: 16px 48px 0 48px; border-top: 1px solid #eee; margin-top: 32px; color: #999; font-size: 10.5px; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <h1>${escapeHtml(club.name)}</h1>
        ${quote.subtitle ? `<div class="subtitle">${escapeHtml(quote.subtitle)}</div>` : ""}
        ${quote.seasonLabel ? `<div class="season">${escapeHtml(quote.seasonLabel)}</div>` : ""}
      </div>
      <div class="doc-title">${escapeHtml(quote.title || "DEVIS")}</div>
    </div>

    <div class="body">
      <div class="meta-row">
        <span>Date : ${formatLongDate(quote.date)}</span>
        <span>N° du devis : ${quote.number ? escapeHtml(quote.number) : "à renseigner"}</span>
      </div>

      <div class="columns">
        <div class="col">
          <div class="col-title">ÉMETTEUR</div>
          ${linesHtml(quote.emitterLines)}
        </div>
        <div class="col">
          <div class="col-title">DESTINATAIRE</div>
          ${linesHtml(quote.recipientLines)}
        </div>
      </div>

      ${
        quote.infoTitle || quote.infoText
          ? `<div class="info-box">
              ${quote.infoTitle ? `<div class="col-title">${escapeHtml(quote.infoTitle)}</div>` : ""}
              ${quote.infoText ? `<div>${linesHtml(quote.infoText)}</div>` : ""}
            </div>`
          : ""
      }

      ${quote.prestationTitle ? `<div class="section-title">${escapeHtml(quote.prestationTitle)}</div>` : ""}
      ${quote.prestationText ? `<div class="prestation-text">${linesHtml(quote.prestationText)}</div>` : ""}

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
                        <div class="item-label">${escapeHtml(r.label)}</div>
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

            <div class="total-row">
              <div class="total-badge">
                <span>TOTAL CONVENU</span>
                <span class="amount">${formatEuro(total)}</span>
              </div>
            </div>`
          : ""
      }

      ${quote.termsTitle ? `<div class="section-title">${escapeHtml(quote.termsTitle)}</div>` : ""}
      ${quote.termsText ? `<div class="terms-text">${escapeHtml(quote.termsText)}</div>` : ""}

      ${
        quote.signatureLeftLabel || quote.signatureRightLabel
          ? `<div class="sign-row">
              <div class="sign-col">
                ${quote.signatureLeftLabel ? `<div class="label">${escapeHtml(quote.signatureLeftLabel)}</div>` : ""}
                <div class="hint">Nom, date, signature${quote.signatureLeftLabel ? " et cachet" : ""} :</div>
              </div>
              <div class="sign-col">
                ${quote.signatureRightLabel ? `<div class="label">${escapeHtml(quote.signatureRightLabel)}</div>` : ""}
                <div class="hint">Nom, date et signature :</div>
              </div>
            </div>`
          : ""
      }
    </div>

    <div class="footer">${escapeHtml(club.name)}${club.rna ? ` — RNA : ${escapeHtml(club.rna)}` : ""}</div>
  </div>
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
