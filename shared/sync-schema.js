const crypto = require("crypto")

/**
 * Schéma SQLite utilisé par l'app Electron (electron/db.js) — aucune dépendance à Electron ici (pas
 * d'`app.getPath`), uniquement à l'objet `db` (node:sqlite DatabaseSync) passé en paramètre.
 *
 * ⚠️ Ce fichier est DUPLIQUÉ à l'identique dans nas-sync-server/sync-schema.js, pour que le dossier
 * nas-sync-server/ reste transférable seul sur un NAS sans dépendre du reste du dépôt (il n'a pas de
 * require("../shared/...")). Si vous modifiez le schéma ici, reportez le même changement là-bas.
 */

/** Tables "métier" synchronisées avec le NAS — chacune reçoit sync_version/updated_at/deleted_at
 * (voir SYNC_TABLES ci-dessous) et chaque écriture y est journalisée dans sync_changes. Les tables
 * sync_changes/sync_row_state/sync_conflicts/sync_meta (mécanique de sync elle-même) n'en font
 * jamais partie : elles restent strictement locales à chaque base. */
const SYNC_TABLES = [
  "users",
  "clients",
  "transactions",
  "bank_transactions",
  "settings",
  "vault",
  "seasons",
  "client_seasons",
  "import_batches",
  "import_batch_changes",
  "fixed_assets",
  "debts",
  "cotisation_prices",
  "equipment_items",
  "disciplines",
  "payers",
  "quotes",
]

/** Colonne(s) formant la clé primaire de chaque table synchronisée — la plupart ont un `id` TEXT
 * (UUID), mais quelques-unes ont une clé naturelle (`settings.key`, `cotisation_prices.course_type`,
 * `vault.id` fixe) ou composite (`client_seasons`). Utilisé pour construire/lire le `row_id` (TEXT)
 * générique du journal de sync (voir rowIdFromRow/pkValuesFromRowId) sans avoir à écrire un cas
 * particulier par table dans le moteur de sync lui-même (client ou serveur). */
const TABLE_PRIMARY_KEYS = {
  users: ["id"],
  clients: ["id"],
  transactions: ["id"],
  bank_transactions: ["id"],
  settings: ["key"],
  vault: ["id"],
  seasons: ["id"],
  client_seasons: ["client_id", "season_id"],
  import_batches: ["id"],
  import_batch_changes: ["id"],
  fixed_assets: ["id"],
  debts: ["id"],
  cotisation_prices: ["course_type"],
  equipment_items: ["id"],
  disciplines: ["id"],
  payers: ["id"],
  quotes: ["id"],
}

/** row_id générique (toujours une string) à partir d'une ligne complète, ex. "c1" pour un id simple,
 * ou "c1:s1" pour client_seasons (client_id:season_id). */
function rowIdFromRow(table, row) {
  const pk = TABLE_PRIMARY_KEYS[table]
  if (!pk) throw new Error(`Table non synchronisée : ${table}`)
  return pk.map((col) => String(row[col])).join(":")
}

/** Inverse de rowIdFromRow : reconstruit les paires colonne -> valeur de la clé primaire à partir
 * d'un row_id générique, pour pouvoir écrire `WHERE col1 = ? AND col2 = ?` sans cas particulier. */
function pkValuesFromRowId(table, rowId) {
  const pk = TABLE_PRIMARY_KEYS[table]
  if (!pk) throw new Error(`Table non synchronisée : ${table}`)
  const parts = String(rowId).split(":")
  return Object.fromEntries(pk.map((col, i) => [col, parts[i]]))
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      security_question TEXT,
      security_answer_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      stripe_customer_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL,
      method TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      member TEXT,
      method TEXT NOT NULL,
      category TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      justificatif_type TEXT,
      justificatif_name TEXT,
      stripe_payment_intent_id TEXT,
      stripe_charge_id TEXT,
      stripe_fee REAL,
      stripe_net REAL,
      stripe_raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      gocardless_account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS vault (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      salt_b64 TEXT NOT NULL,
      iv_b64 TEXT NOT NULL,
      ciphertext_b64 TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      provider TEXT PRIMARY KEY,
      cursor TEXT,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_seasons (
      client_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      status TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (client_id, season_id)
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      undone INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_batch_changes (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      previous_json TEXT
    );

    CREATE TABLE IF NOT EXISTS fixed_assets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      purchase_amount REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      depreciation_years INTEGER NOT NULL,
      disposed INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT,
      settled INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cotisation_prices (
      course_type TEXT PRIMARY KEY,
      price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment_items (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS disciplines (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payers (
      id TEXT PRIMARY KEY,
      stripe_customer_id TEXT UNIQUE,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Devis : document librement rempli (pas rattaché à un adhérent/une transaction, contrairement
    -- aux factures) — chaque champ est du texte libre que le trésorier remplit comme il l'entend,
    -- voir electron/quote-pdf.js pour le rendu.
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'DEVIS',
      subtitle TEXT NOT NULL DEFAULT '',
      season_label TEXT NOT NULL DEFAULT '',
      emitter_lines TEXT NOT NULL DEFAULT '',
      recipient_lines TEXT NOT NULL DEFAULT '',
      info_title TEXT NOT NULL DEFAULT '',
      info_text TEXT NOT NULL DEFAULT '',
      prestation_title TEXT NOT NULL DEFAULT '',
      prestation_text TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL DEFAULT '[]',
      terms_title TEXT NOT NULL DEFAULT '',
      terms_text TEXT NOT NULL DEFAULT '',
      validity_text TEXT NOT NULL DEFAULT '',
      signature_left_label TEXT NOT NULL DEFAULT '',
      signature_right_label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Journal de synchronisation NAS — strictement local, jamais synchronisé lui-même (voir
    -- SYNC_TABLES ci-dessus, qui n'inclut jamais ces 4 tables).
    CREATE TABLE IF NOT EXISTS sync_changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      op TEXT NOT NULL,
      payload_json TEXT,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      device_id TEXT NOT NULL,
      pushed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_row_state (
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      last_synced_version INTEGER NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (table_name, row_id)
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      local_payload_json TEXT NOT NULL,
      remote_payload_json TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      resolved_at TEXT
    );

    -- Bookkeeping purement local (identifiant de cet appareil, curseur de pull) : jamais dans
    -- settings, pour que l'exclusion de la sync soit structurelle et non un filtre qu'on pourrait
    -- oublier d'appliquer.
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  ensureColumn(db, "clients", "address", "address TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "clients", "phone", "phone TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "clients", "birth_date", "birth_date TEXT")
  ensureColumn(db, "clients", "postal_code", "postal_code TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, "clients", "city", "city TEXT NOT NULL DEFAULT ''")
  // "guardian_id" n'est plus utilisé par le code (voir payer_id / migratePayersBackfill ci-dessous)
  // mais la colonne reste en base — comme pour cotisation_prices, on ne DROP jamais une colonne qui
  // contenait des données réelles, au cas où une ancienne sauvegarde/export y ferait encore référence.
  ensureColumn(db, "clients", "guardian_id", "guardian_id TEXT")
  ensureColumn(db, "clients", "payer_id", "payer_id TEXT")
  // Nature du lien avec le payeur, choisie explicitement depuis la fiche payeur (voir
  // components/payeurs/add-payer-dialog.tsx) plutôt que devinée par comparaison de noms :
  // "self" = le payeur est cet adhérent lui-même (il règle sa propre cotisation), "child" = un
  // enfant dont le payeur (parent) règle la cotisation. Détermine qui est facturé (voir
  // resolveClientForInvoice dans electron/main.js).
  ensureColumn(db, "clients", "payer_relationship", "payer_relationship TEXT")
  // Rétro-compatibilité : les liens payer_id posés avant l'ajout de cette colonne n'ont pas encore
  // de valeur — on la déduit une bonne fois par comparaison de noms (même nom que le payeur = lui-
  // même, sinon un enfant), au lieu de reproduire cette heuristique à chaque lecture.
  db.prepare(
    `UPDATE clients SET payer_relationship = (
       CASE WHEN EXISTS (
         SELECT 1 FROM payers p
         WHERE p.id = clients.payer_id
           AND lower(trim(p.first_name || ' ' || p.last_name)) = lower(trim(clients.first_name || ' ' || clients.last_name))
       ) THEN 'self' ELSE 'child' END
     )
     WHERE payer_id IS NOT NULL AND payer_relationship IS NULL`,
  ).run()
  // Membre du bureau (trésorier, président...) : non null = exonéré de cotisation, le texte sert de
  // libellé de rôle imprimé sur la facture à 0 € générée pour lui (voir receipts:*-virtual).
  ensureColumn(db, "clients", "board_role", "board_role TEXT")
  // Adhérent explicitement associé à cette transaction (distinct de "member", qui reste le nom du
  // PAYEUR tel qu'il apparaît sur le règlement) : utile quand un parent et son enfant sont tous les
  // deux adhérents mais qu'un seul paie — la facture doit nommer l'enfant, pas le parent qui a réglé.
  ensureColumn(db, "transactions", "linked_client_id", "linked_client_id TEXT")
  // Payeur explicitement associé à cette transaction — utile quand Stripe ne fournit aucun nom
  // (carte payée sans nom de facturation) ou pour une écriture manuelle : contrairement à "member"
  // (texte libre, affichage seulement), ceci est un vrai lien vers la fiche payeur, utilisé pour
  // générer la facture, et jamais touché par une resynchro Stripe (voir upsertTransactionByChargeId,
  // dont l'UPDATE ne référence ni member ni linked_payer_id).
  ensureColumn(db, "transactions", "linked_payer_id", "linked_payer_id TEXT")
  // Numéro de facture (ex. "202611211" = date du règlement "20261121" + 1er numéro attribué ce
  // jour-là), attribué une seule fois au premier aperçu/téléchargement de la facture puis conservé
  // définitivement (voir getOrAssignInvoiceNumber) — ne doit jamais être recalculé ensuite, y compris
  // après une resynchro Stripe, pour rester une référence stable sur les documents déjà remis.
  ensureColumn(db, "transactions", "invoice_number", "invoice_number TEXT")
  // Une fois que le trésorier a corrigé à la main le nom d'un payeur (ex. mise en forme NOM/Prénom,
  // faute de frappe Stripe), une resynchro Stripe ne doit plus jamais l'écraser — voir
  // upsertPayerByStripeId/upsertGuestPayer.
  ensureColumn(db, "payers", "name_manually_edited", "name_manually_edited INTEGER NOT NULL DEFAULT 0")
  // Facture réellement générée par Stripe (Stripe Invoicing) pour cette charge, quand elle existe :
  // on préfère toujours la vraie facture Stripe à celle que l'on génère nous-mêmes.
  ensureColumn(db, "transactions", "stripe_invoice_pdf_url", "stripe_invoice_pdf_url TEXT")
  // Ajouté après la sortie initiale du devis : les devis déjà créés n'ont pas cette colonne tant
  // que ce IF NOT EXISTS ne la crée pas explicitement.
  ensureColumn(db, "quotes", "validity_text", "validity_text TEXT NOT NULL DEFAULT ''")
  // Double authentification (TOTP) pour la récupération de mot de passe — voir lib/crypto/totp.ts.
  ensureColumn(db, "users", "totp_secret", "totp_secret TEXT")
  // Version serveur au moment du conflit — indispensable pour rebaser correctement le curseur de
  // sync lors de la résolution (voir resolveConflictKeepLocal/Remote dans electron/db.js) : quand
  // remote_payload_json est NULL (le serveur n'a tout simplement pas cette ligne, ex. après un
  // vidage du NAS), il n'y a aucun payload dont extraire sync_version, donc sans cette colonne la
  // résolution "Garder la version locale" retombe sur l'ancienne valeur fautive et le conflit
  // réapparaît identique au prochain push.
  ensureColumn(db, "sync_conflicts", "remote_version", "remote_version INTEGER")

  // Sync NAS : version optimiste, horodatage de dernière écriture, tombstone de suppression douce —
  // sur chaque table métier synchronisée (jamais sur sync_changes/sync_row_state/sync_conflicts/
  // sync_meta, qui ne font pas partie de SYNC_TABLES et restent locales par construction).
  for (const table of SYNC_TABLES) {
    ensureColumn(db, table, "sync_version", "sync_version INTEGER NOT NULL DEFAULT 1")
    // node:sqlite refuse un DEFAULT non constant sur ALTER TABLE ADD COLUMN (contrairement au CLI
    // sqlite3) : "Cannot add a column with non-constant default" pour DEFAULT (datetime('now')) ou
    // même DEFAULT CURRENT_TIMESTAMP. On pose donc une valeur par défaut constante, puis on
    // rattrape l'horodatage réel juste après — uniquement sur les lignes qui viennent de recevoir
    // la colonne (chaîne vide), jamais sur un updated_at déjà renseigné par un cycle précédent.
    const addedUpdatedAt = ensureColumn(db, table, "updated_at", "updated_at TEXT NOT NULL DEFAULT ''")
    if (addedUpdatedAt) {
      db.exec(`UPDATE ${table} SET updated_at = datetime('now') WHERE updated_at = ''`)
    }
    ensureColumn(db, table, "deleted_at", "deleted_at TEXT")
  }

  // Identifiant de cet appareil pour la sync NAS — généré une seule fois, jamais recalculé, jamais
  // dans `settings` (qui, lui, est entièrement synchronisé).
  const existingDeviceId = db.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get()
  if (!existingDeviceId) {
    db.prepare("INSERT INTO sync_meta (key, value) VALUES ('device_id', @value)").run({
      value: crypto.randomUUID(),
    })
  }

}

/** Rattrapages réservés au poste Electron (jamais au serveur de sync NAS, voir runClientBackfills
 * ci-dessous) : ils donnent un sens à des données locales préexistantes (anciennes disciplines
 * codées en dur, anciens tuteurs, etc.). Le serveur NAS démarre toujours avec une base vide — s'il
 * exécutait ces mêmes rattrapages, il se mettrait à fabriquer ses PROPRES lignes par défaut (ex. les
 * mêmes disciplines "Kung-fu Adulte"... avec un id différent de celui du client), et le premier push
 * d'un poste échouerait alors sur une contrainte UNIQUE (ex. disciplines.label) en percutant ces
 * lignes fantômes. C'est exactement le bug observé : le serveur avait lui-même généré ses
 * disciplines par défaut avant que le client ne pousse les siennes. */
function runClientBackfills(db) {
  migrateSeasonMembershipBackfill(db)
  migrateDisciplinesBackfill(db)
  migratePayersBackfill(db)
  // Doit tourner EN DERNIER : capture l'état de chaque table après les backfills ci-dessus (qui
  // insèrent eux-mêmes des lignes sans passer par recordChange).
  migrateSyncChangesBackfill(db)
}

/** Les données déjà présentes AVANT l'ajout de la synchronisation NAS n'ont jamais eu d'entrée dans
 * sync_changes (recordChange n'existait pas encore) : sans ce rattrapage, un premier push vers un
 * NAS vide n'envoie RIEN, puisque getUnpushedChanges() ne trouve aucune ligne à pousser — le NAS
 * resterait vide alors que l'app locale est pleine. On crée donc, une bonne fois, une entrée
 * "upsert" (ou "delete" pour une ligne déjà tombstonée) pour chaque ligne de chaque table
 * synchronisée qui n'a encore aucune trace dans le journal, à sa version actuelle — pour que le tout
 * premier cycle de synchro envoie bien l'intégralité des données locales existantes. Ne s'exécute
 * qu'une seule fois (marqueur sync_meta, jamais dans `settings`). */
function migrateSyncChangesBackfill(db) {
  const already = db.prepare("SELECT value FROM sync_meta WHERE key = 'sync_changes_backfilled'").get()
  if (already) return

  const deviceRow = db.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get()
  const deviceId = deviceRow?.value || "unknown"

  const insert = db.prepare(
    `INSERT INTO sync_changes (table_name, row_id, op, payload_json, version, updated_at, device_id)
     VALUES (@table, @rowId, @op, @payloadJson, @version, @updatedAt, @deviceId)`,
  )

  for (const table of SYNC_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all()
    for (const row of rows) {
      const rowId = rowIdFromRow(table, row)
      const existing = db
        .prepare("SELECT 1 FROM sync_changes WHERE table_name = @table AND row_id = @rowId")
        .get({ table, rowId })
      if (existing) continue
      const op = row.deleted_at ? "delete" : "upsert"
      insert.run({
        table,
        rowId,
        op,
        payloadJson: op === "delete" ? null : JSON.stringify(row),
        version: row.sync_version ?? 1,
        updatedAt: row.updated_at || new Date().toISOString(),
        deviceId,
      })
    }
  }

  db.prepare("INSERT INTO sync_meta (key, value) VALUES ('sync_changes_backfilled', '1')").run()
}

/** Les disciplines étaient une liste fixe codée en dur ("Kung-fu Adulte", "Ado", "Enfant"…) : on la
 * transforme en liste librement modifiable par le trésorier (ajout, suppression, prix), comme pour
 * le matériel. Pour ne rien perdre, on importe une fois pour toutes les anciennes disciplines fixes
 * (avec leur tarif déjà configuré dans cotisation_prices, s'il existe) et toute valeur de "cours"
 * déjà utilisée par un client — ainsi aucune fiche existante ne se retrouve avec un cours orphelin. */
function migrateDisciplinesBackfill(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'disciplinesMigrated'").get()
  if (already) return

  const legacyCourseTypes = [
    "Kung-fu Adulte",
    "Kung-fu Ado",
    "Kung-fu Enfant",
    "Fitness de combat",
    "Tai-chi",
    "Self-défense",
  ]
  const usedStatuses = db
    .prepare("SELECT DISTINCT status FROM clients WHERE status IS NOT NULL AND status <> 'Non catégorisé'")
    .all()
    .map((r) => r.status)
  const prices = Object.fromEntries(
    db.prepare("SELECT course_type, price FROM cotisation_prices").all().map((r) => [r.course_type, r.price]),
  )

  const labels = new Set([...legacyCourseTypes, ...usedStatuses])
  const insert = db.prepare(
    `INSERT INTO disciplines (id, label, price) VALUES (@id, @label, @price)
     ON CONFLICT(label) DO NOTHING`,
  )
  for (const label of labels) {
    insert.run({ id: crypto.randomUUID(), label, price: prices[label] ?? 0 })
  }

  db.prepare("INSERT INTO settings (key, value) VALUES ('disciplinesMigrated', '1')").run()
}

/** Un "client" mélangeait jusqu'ici deux rôles différents : l'adhérent (celui qui suit un cours) et
 * le payeur (celui qui règle — souvent un parent, pas forcément lui-même adhérent). On les sépare :
 * chaque adhérent garde sa fiche (cours, statut payé) mais pointe désormais vers une fiche "payeur"
 * distincte (payer_id) au lieu de pointer vers une autre fiche client (guardian_id). Ne s'exécute
 * qu'une fois ; ne supprime jamais de fiche existante (trop risqué sur des données réelles) — les
 * anciennes fiches "tuteur" qui n'étaient en fait que des payeurs restent visibles dans Adhérents
 * jusqu'à ce que le trésorier les nettoie lui-même depuis l'écran dédié. */
function migratePayersBackfill(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'payersMigrated'").get()
  if (already) return

  const clients = db.prepare("SELECT * FROM clients").all()
  const insertPayer = db.prepare(
    `INSERT INTO payers (id, stripe_customer_id, first_name, last_name, email, phone, address, postal_code, city)
     VALUES (@id, @stripeCustomerId, @firstName, @lastName, @email, @phone, @address, @postalCode, @city)`,
  )
  const setPayerId = db.prepare("UPDATE clients SET payer_id = @payerId WHERE id = @clientId")

  // clientId de la personne "résolue" comme payeur -> id du payer déjà créé pour elle (une fratrie
  // partageant le même tuteur ne doit donner naissance qu'à un seul payeur, pas un par enfant).
  const payerIdByResolvedClientId = new Map()

  function resolvePayerClientId(client) {
    if (!client.guardian_id) return client.id
    const guardian = clients.find((c) => c.id === client.guardian_id)
    return guardian ? guardian.id : client.id
  }

  for (const client of clients) {
    const resolvedId = resolvePayerClientId(client)
    let payerId = payerIdByResolvedClientId.get(resolvedId)
    if (!payerId) {
      const source = clients.find((c) => c.id === resolvedId) || client
      payerId = crypto.randomUUID()
      insertPayer.run({
        id: payerId,
        stripeCustomerId: source.stripe_customer_id || null,
        firstName: source.first_name,
        lastName: source.last_name,
        email: source.email || "",
        phone: source.phone || "",
        address: source.address || "",
        postalCode: source.postal_code || "",
        city: source.city || "",
      })
      payerIdByResolvedClientId.set(resolvedId, payerId)
    }
    setPayerId.run({ payerId, clientId: client.id })
  }

  db.prepare("INSERT INTO settings (key, value) VALUES ('payersMigrated', '1')").run()
}

/** Avant cette fonctionnalité, "client_seasons" ne servait qu'à surclasser cours/payé : une
 * saison sans ligne explicite affichait quand même tous les clients (repli sur la fiche globale).
 * On bascule désormais vers une vraie appartenance par saison (un client n'apparaît que s'il a une
 * ligne "client_seasons"), donc pour ne pas vider d'un coup une saison déjà utilisée, on inscrit une
 * fois pour toutes tous les clients actuels dans chaque saison existante qui n'a encore aucune ligne.
 * Ne s'exécute qu'une seule fois (marqueur en base) : les saisons créées après ce passage démarrent
 * volontairement avec un effectif vide, comme demandé. */
function migrateSeasonMembershipBackfill(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'seasonMembershipMigrated'").get()
  if (already) return

  const seasons = db.prepare("SELECT id FROM seasons").all()
  const clients = db.prepare("SELECT id, status, paid FROM clients").all()
  const insert = db.prepare(
    `INSERT INTO client_seasons (client_id, season_id, status, paid)
     VALUES (@clientId, @seasonId, @status, @paid)
     ON CONFLICT(client_id, season_id) DO NOTHING`,
  )
  for (const season of seasons) {
    const count = db.prepare("SELECT COUNT(*) AS n FROM client_seasons WHERE season_id = ?").get(season.id).n
    if (count > 0) continue
    for (const client of clients) {
      insert.run({ clientId: client.id, seasonId: season.id, status: client.status, paid: client.paid })
    }
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('seasonMembershipMigrated', '1')").run()
}

/** Ajoute une colonne à une table existante si elle n'y est pas déjà (les CREATE TABLE IF NOT EXISTS
 * ci-dessus ne touchent pas les tables déjà créées lors d'une version antérieure). Renvoie `true` si
 * la colonne vient d'être ajoutée (pour permettre un rattrapage ponctuel, ex. backfill), `false` si
 * elle existait déjà. */
function ensureColumn(database, table, column, columnDdl) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`)
    return true
  }
  return false
}

module.exports = {
  migrate,
  runClientBackfills,
  ensureColumn,
  SYNC_TABLES,
  TABLE_PRIMARY_KEYS,
  rowIdFromRow,
  pkValuesFromRowId,
}
