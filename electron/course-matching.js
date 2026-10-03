const LEGACY_COURSE_TYPES = [
  "Kung-fu Adulte",
  "Kung-fu Ado",
  "Kung-fu Enfant",
  "Fitness de combat",
  "Tai-chi",
  "Self-défense",
  "Non catégorisé",
]

/** Insensible aux accents, à la casse, aux espaces/underscores/tirets — pour tolérer les
 * variantes d'écriture entre une source externe (Excel/CSV, description Stripe) et nos
 * disciplines. */
function normalizeLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
}

/** Rapproche un texte libre (catégorie de fichier importé, description de paiement Stripe...) avec
 * une discipline connue (les 6 historiques + celles configurées sur /disciplines, en plus des
 * labels explicitement passés). Si rien ne correspond, retourne la valeur brute telle quelle
 * (les disciplines sont une liste libre : toute nouvelle valeur devient une discipline à part
 * entière, jamais un cours deviné à vide) — sauf si `createIfMissing` vaut false, auquel cas on
 * retourne null (utile quand l'appelant ne veut jamais créer de discipline implicitement, par ex.
 * une détection automatique peu fiable comme une description de paiement Stripe en texte libre).
 */
function matchCourseLabel(raw, knownLabels, { createIfMissing = true } = {}) {
  if (!raw) return null
  const norm = normalizeLabel(raw)
  // Les disciplines réellement configurées par le club passent avant les 6 anciennes valeurs
  // figées : si les deux correspondent (ex. "Kung-fu Adulte" vs "Kung Fu Adultes (16 ans et +)"),
  // on préfère toujours la vraie discipline du club plutôt que de faire revivre l'ancien nom.
  const candidates = [...new Set([...knownLabels, ...LEGACY_COURSE_TYPES])]
  const exact = candidates.find((c) => normalizeLabel(c) === norm)
  if (exact) return exact
  const fuzzy = candidates.find((c) => normalizeLabel(c).includes(norm) || norm.includes(normalizeLabel(c)))
  if (fuzzy) return fuzzy
  return createIfMissing ? raw.trim() : null
}

module.exports = { LEGACY_COURSE_TYPES, normalizeLabel, matchCourseLabel }
