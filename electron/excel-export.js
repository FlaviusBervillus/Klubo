const ExcelJS = require("exceljs")
const db = require("./db")

const METHOD_LABELS = { especes: "Espèces", cheque: "Chèque", virement: "Virement", stripe: "Stripe" }
const STATUS_LABELS = {
  valide: "Validé",
  en_attente: "En attente",
  a_categoriser: "À catégoriser",
  remboursee: "Remboursé",
  remboursee_partiellement: "Remboursé partiellement",
  echec: "Échec / Annulé",
}
const TYPE_LABELS = { entree: "Entrée", sortie: "Sortie" }

/** Export lisible (Excel) de toute la comptabilité, en plus de la sauvegarde .sqlite3 illisible sans l'app. */
async function generateExcelBuffer() {
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date()

  const txSheet = workbook.addWorksheet("Transactions")
  txSheet.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "Description", key: "description", width: 40 },
    { header: "Adhérent", key: "member", width: 25 },
    { header: "Méthode", key: "method", width: 12 },
    { header: "Catégorie", key: "category", width: 20 },
    { header: "Type", key: "type", width: 10 },
    { header: "Montant (€)", key: "amount", width: 12 },
    { header: "Statut", key: "status", width: 22 },
    { header: "Frais Stripe (€)", key: "stripeFee", width: 15 },
    { header: "Net Stripe (€)", key: "stripeNet", width: 15 },
  ]
  for (const tx of db.getTransactions()) {
    txSheet.addRow({
      date: new Date(tx.date).toLocaleString("fr-FR"),
      description: tx.description,
      member: tx.member || "",
      method: METHOD_LABELS[tx.method] || tx.method,
      category: tx.category || "",
      type: TYPE_LABELS[tx.type] || tx.type,
      amount: tx.amount,
      status: STATUS_LABELS[tx.status] || tx.status,
      stripeFee: tx.stripe_fee ?? "",
      stripeNet: tx.stripe_net ?? "",
    })
  }
  txSheet.getRow(1).font = { bold: true }
  txSheet.autoFilter = { from: "A1", to: "J1" }

  const clientSheet = workbook.addWorksheet("Clients")
  clientSheet.columns = [
    { header: "Prénom", key: "firstName", width: 20 },
    { header: "Nom", key: "lastName", width: 20 },
    { header: "Email", key: "email", width: 30 },
    { header: "Adresse", key: "address", width: 40 },
    { header: "Cours", key: "status", width: 20 },
    { header: "Méthode", key: "method", width: 12 },
    { header: "Payé", key: "paid", width: 10 },
  ]
  for (const c of db.getClients()) {
    clientSheet.addRow({
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      address: c.address,
      status: c.status,
      method: METHOD_LABELS[c.method] || c.method,
      paid: c.paid ? "Oui" : "Non",
    })
  }
  clientSheet.getRow(1).font = { bold: true }
  clientSheet.autoFilter = { from: "A1", to: "G1" }

  return workbook.xlsx.writeBuffer()
}

module.exports = { generateExcelBuffer }
