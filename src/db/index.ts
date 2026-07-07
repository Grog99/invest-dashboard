import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { computeDedupKey } from "../lib/format";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "invest.db");

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'GPW',
  currency TEXT NOT NULL DEFAULT 'PLN',
  quote_symbol TEXT NOT NULL,
  watchlist INTEGER NOT NULL DEFAULT 0,
  aliases TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  commission REAL NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_company ON transactions(company_id, date);

CREATE TABLE IF NOT EXISTS dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  tax_withheld REAL NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_dividends_company ON dividends(company_id, date);

CREATE TABLE IF NOT EXISTS quotes_latest (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  prev_close REAL,
  date TEXT,
  time TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes_daily (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL NOT NULL,
  volume REAL,
  PRIMARY KEY (company_id, date)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  rate REAL NOT NULL,
  PRIMARY KEY (currency, date)
);

CREATE TABLE IF NOT EXISTS news_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fetched_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES news_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  summary TEXT,
  published_at TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  dedup_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC);

CREATE TABLE IF NOT EXISTS news_company (
  news_id INTEGER NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (news_id, company_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Szybki, czysto odczytowy test "czy w ogóle jest coś do zrobienia" — pozwala
// pominąć otwieranie transakcji zapisu (i przez to blokadę pliku WAL), gdy
// migracja była już wykonana. Next.js `next build` importuje moduły tras w
// wielu równoległych procesach roboczych ("Collecting page data using N
// workers") — każdy z nich woła createDb() (a więc i migrateNewsDedup) we
// własnym procesie; bez tej bramki każdy z nich bezwarunkowo wykonywałby
// INSERT/DELETE/CREATE INDEX (zapisy — wymagają blokady zapisu SQLite nawet
// gdy nic finalnie nie zmieniają), co przy N równoległych procesach dawało
// realny `SQLITE_BUSY: database is locked` (odtworzone lokalnie: build bez
// tej bramki wywalał się na współbieżnych workerach, mimo że baza była już
// w pełni zmigrowana). Same odczyty w trybie WAL nie blokują się nawzajem.
function needsNewsDedupMigration(sqlite: Database.Database): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(news_items)`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "dedup_key")) return true;

  const pending = sqlite
    .prepare(
      `SELECT 1 FROM news_items WHERE dedup_key IS NULL AND published_at IS NOT NULL LIMIT 1`
    )
    .get();
  if (pending) return true;

  const duplicate = sqlite
    .prepare(
      `SELECT 1 FROM news_items WHERE dedup_key IS NOT NULL GROUP BY dedup_key HAVING COUNT(*) > 1 LIMIT 1`
    )
    .get();
  if (duplicate) return true;

  const indexes = sqlite.prepare(`PRAGMA index_list(news_items)`).all() as {
    name: string;
  }[];
  if (!indexes.some((i) => i.name === "idx_news_dedup")) return true;

  return false;
}

// Jednorazowa (idempotentna) migracja: kolumna dedup_key → backfill w JS
// (parytet z computeDedupKey() użytym w runtime) → scalenie istniejących
// duplikatów → indeks UNIQUE. Wołana z createDb() po sqlite.exec(BOOTSTRAP_SQL).
// Patrz docs/plans/scalanie-duplikatow-newsow.md — sekcja o kolejności operacji.
function migrateNewsDedup(sqlite: Database.Database): void {
  if (!needsNewsDedupMigration(sqlite)) return;

  const migrate = sqlite.transaction(() => {
    // 1. Kolumna (idempotentnie) — na świeżej bazie już jest z CREATE TABLE.
    const cols = sqlite.prepare(`PRAGMA table_info(news_items)`).all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "dedup_key")) {
      sqlite.exec(`ALTER TABLE news_items ADD COLUMN dedup_key TEXT`);
    }

    // 2. Backfill w JS — nie liczyć przez SQL-owe lower() (ASCII-only, patrz plan).
    const rows = sqlite
      .prepare(
        `SELECT id, title, published_at AS publishedAt FROM news_items WHERE dedup_key IS NULL AND published_at IS NOT NULL`
      )
      .all() as { id: number; title: string; publishedAt: string | null }[];
    const updateKey = sqlite.prepare(
      `UPDATE news_items SET dedup_key = ? WHERE id = ?`
    );
    for (const row of rows) {
      const key = computeDedupKey(row.title, row.publishedAt);
      if (key !== null) updateKey.run(key, row.id);
    }

    // 3a. Przenieś brakujące dopasowania firm z duplikatów do kanonicznego
    // (najstarszego = MIN(id)) wiersza w grupie o tym samym dedup_key.
    sqlite.exec(`
      INSERT OR IGNORE INTO news_company (news_id, company_id)
      SELECT keep.min_id, nc.company_id
      FROM news_company nc
      JOIN news_items ni ON ni.id = nc.news_id
      JOIN (
        SELECT dedup_key, MIN(id) AS min_id
        FROM news_items
        WHERE dedup_key IS NOT NULL
        GROUP BY dedup_key
      ) keep ON keep.dedup_key = ni.dedup_key
      WHERE nc.news_id <> keep.min_id;
    `);

    // 3b. Usuń nadmiarowe wiersze (wszystkie poza MIN(id) w grupie). Musi iść
    // PO (3a) — kaskada ON DELETE CASCADE na news_company skasowałaby
    // dopasowania duplikatu, zanim zostałyby przeniesione.
    sqlite.exec(`
      DELETE FROM news_items
      WHERE dedup_key IS NOT NULL
        AND id NOT IN (
          SELECT MIN(id) FROM news_items WHERE dedup_key IS NOT NULL GROUP BY dedup_key
        );
    `);

    // 4. Indeks UNIQUE — dopiero po scaleniu, inaczej CREATE by się wywalił
    // na zduplikowanych kluczach.
    sqlite.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_news_dedup ON news_items(dedup_key);`
    );
  });
  migrate();
}

function createDb(): BetterSQLite3Database<typeof schema> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Next.js buduje/uruchamia wiele równoległych procesów roboczych, z których
  // każdy otwiera to samo `data/invest.db` i (raz, przy pierwszej migracji)
  // rywalizuje o blokadę zapisu WAL — podnosimy limit oczekiwania powyżej
  // domyślnych 5s better-sqlite3, żeby to się kolejkowało zamiast rzucać
  // SQLITE_BUSY. Zwykły odczyt/zapis aplikacji jest na tyle szybki, że to nie
  // wprowadza zauważalnego opóźnienia w praktyce.
  sqlite.pragma("busy_timeout = 15000");
  sqlite.exec(BOOTSTRAP_SQL);
  migrateNewsDedup(sqlite);
  return drizzle(sqlite, { schema });
}

// Singleton — przeżywa hot-reload w dev (globalThis nie jest resetowane).
const globalForDb = globalThis as unknown as {
  __investDb?: BetterSQLite3Database<typeof schema>;
};

export const db = globalForDb.__investDb ?? createDb();
globalForDb.__investDb = db;

export * from "./schema";
