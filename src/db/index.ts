import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { computeDedupKey } from "../lib/format";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
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
  type TEXT NOT NULL DEFAULT 'STOCK',
  domain TEXT,
  color TEXT,
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
-- Indeks wyrażeniowy pod kursor keyset paginacji (src/lib/news.ts listNews):
-- odzwierciedla dokładnie ORDER BY/WHERE zapytania stronicowanego, żeby
-- planner mógł go użyć zamiast sortować całą tabelę przy rosnącej bazie.
CREATE INDEX IF NOT EXISTS idx_news_published_id ON news_items(coalesce(published_at,'') DESC, id DESC);

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

CREATE TABLE IF NOT EXISTS note_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);

CREATE TABLE IF NOT EXISTS company_logos (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  fetched_at TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cfd_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  direction TEXT NOT NULL,
  volume REAL NOT NULL,
  open_price REAL NOT NULL,
  point_value REAL NOT NULL,
  quote_symbol TEXT NOT NULL DEFAULT 'WIG20.WA',
  opened_at TEXT NOT NULL,
  override_price REAL,
  override_pnl REAL,
  swap_pln REAL,
  quote_price REAL,
  quote_updated_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
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

// Tani read-only guard (patrz komentarz przy needsNewsDedupMigration powyżej):
// samo PRAGMA table_info nie zapisuje nic, więc N równoległych workerów `next
// build` może je odpytać bez rywalizacji o blokadę zapisu WAL.
function needsCompanyTypeMigration(sqlite: Database.Database): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(companies)`).all() as {
    name: string;
  }[];
  return !cols.some((c) => c.name === "type");
}

// Jednorazowa (idempotentna) migracja: dokłada kolumnę `type` do istniejących
// baz (świeże bazy dostają ją już z BOOTSTRAP_SQL). DEFAULT jest stały
// ('STOCK'), więc ALTER TABLE ... NOT NULL DEFAULT jest dozwolony w SQLite bez
// backfillu — istniejące wiersze dostają 'STOCK' automatycznie.
function migrateCompanyType(sqlite: Database.Database): void {
  if (!needsCompanyTypeMigration(sqlite)) return;
  const migrate = sqlite.transaction(() => {
    // Re-sprawdzamy kolumnę WEWNĄTRZ transakcji zapisu: write-transakcje w
    // SQLite/WAL serializują się między procesami (kolejkują się na
    // busy_timeout), więc dopiero tu mamy pewność, że inny równoległy worker
    // `next build` nie dodał już kolumny między naszym read-only guardem
    // (needsCompanyTypeMigration) a startem tej transakcji — bez tego
    // powtórnego sprawdzenia dwa workery obie widzą "brak kolumny" i drugi
    // ALTER TABLE wywala się na "duplicate column name".
    const cols = sqlite.prepare(`PRAGMA table_info(companies)`).all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "type")) {
      sqlite.exec(
        `ALTER TABLE companies ADD COLUMN type TEXT NOT NULL DEFAULT 'STOCK'`
      );
    }
  });
  migrate();
}

// Tani read-only guard (kalka needsCompanyTypeMigration powyżej) — samo
// PRAGMA table_info nie zapisuje nic, więc N równoległych workerów `next
// build` może je odpytać bez rywalizacji o blokadę zapisu WAL.
function needsCompanyDomainMigration(sqlite: Database.Database): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(companies)`).all() as {
    name: string;
  }[];
  return !cols.some((c) => c.name === "domain");
}

// Jednorazowa (idempotentna) migracja: dokłada nullowalną kolumnę `domain` do
// istniejących baz (świeże bazy dostają ją już z BOOTSTRAP_SQL). Kalka
// migrateCompanyType() — jedyna różnica to brak DEFAULT/backfillu, bo kolumna
// jest nullowalna (patrz docs/plans/ikonki-spolek.md, sekcja „Podejście" pkt 1).
function migrateCompanyDomain(sqlite: Database.Database): void {
  if (!needsCompanyDomainMigration(sqlite)) return;
  const migrate = sqlite.transaction(() => {
    // Re-sprawdzamy kolumnę WEWNĄTRZ transakcji zapisu — patrz komentarz przy
    // migrateCompanyType() powyżej (ten sam wyścig równoległych workerów `next
    // build` między read-only guardem a startem tej transakcji).
    const cols = sqlite.prepare(`PRAGMA table_info(companies)`).all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "domain")) {
      sqlite.exec(`ALTER TABLE companies ADD COLUMN domain TEXT`);
    }
  });
  migrate();
}

// Tani read-only guard (kalka needsCompanyDomainMigration powyżej) — samo
// PRAGMA table_info nie zapisuje nic, więc N równoległych workerów `next
// build` może je odpytać bez rywalizacji o blokadę zapisu WAL.
function needsCompanyColorMigration(sqlite: Database.Database): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(companies)`).all() as {
    name: string;
  }[];
  return !cols.some((c) => c.name === "color");
}

// Jednorazowa (idempotentna) migracja: dokłada nullowalną kolumnę `color` do
// istniejących baz (świeże bazy dostają ją już z BOOTSTRAP_SQL). Kalka 1:1
// migrateCompanyDomain() — format/walidacja koloru: src/lib/companyColor.ts,
// patrz docs/plans/kolor-spolki.md.
function migrateCompanyColor(sqlite: Database.Database): void {
  if (!needsCompanyColorMigration(sqlite)) return;
  const migrate = sqlite.transaction(() => {
    // Re-sprawdzamy kolumnę WEWNĄTRZ transakcji zapisu — patrz komentarz przy
    // migrateCompanyType() powyżej (ten sam wyścig równoległych workerów `next
    // build` między read-only guardem a startem tej transakcji).
    const cols = sqlite.prepare(`PRAGMA table_info(companies)`).all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "color")) {
      sqlite.exec(`ALTER TABLE companies ADD COLUMN color TEXT`);
    }
  });
  migrate();
}

// Tani read-only guard (kalka needsCompanyDomainMigration powyżej) — samo
// PRAGMA table_info nie zapisuje nic, więc N równoległych workerów `next
// build` może je odpytać bez rywalizacji o blokadę zapisu WAL.
function needsCfdSwapMigration(sqlite: Database.Database): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(cfd_positions)`).all() as {
    name: string;
  }[];
  return !cols.some((c) => c.name === "swap_pln");
}

// Jednorazowa (idempotentna) migracja: dokłada nullowalną kolumnę `swap_pln`
// do istniejących baz (świeże bazy dostają ją już z BOOTSTRAP_SQL). Kalka 1:1
// migrateCompanyDomain() — jedyna różnica to nazwa tabeli/kolumny; brak
// DEFAULT/backfillu, bo kolumna jest nullowalna (patrz
// docs/plans/manualny-swap-cfd.md, sekcja „Podejście" pkt 1).
function migrateCfdSwap(sqlite: Database.Database): void {
  if (!needsCfdSwapMigration(sqlite)) return;
  const migrate = sqlite.transaction(() => {
    // Re-sprawdzamy kolumnę WEWNĄTRZ transakcji zapisu — patrz komentarz przy
    // migrateCompanyType() powyżej (ten sam wyścig równoległych workerów `next
    // build` między read-only guardem a startem tej transakcji).
    const cols = sqlite.prepare(`PRAGMA table_info(cfd_positions)`).all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "swap_pln")) {
      sqlite.exec(`ALTER TABLE cfd_positions ADD COLUMN swap_pln REAL`);
    }
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
  migrateCompanyType(sqlite);
  migrateCompanyDomain(sqlite);
  migrateCompanyColor(sqlite);
  migrateCfdSwap(sqlite);
  return drizzle(sqlite, { schema });
}

// Singleton — przeżywa hot-reload w dev (globalThis nie jest resetowane).
const globalForDb = globalThis as unknown as {
  __investDb?: BetterSQLite3Database<typeof schema>;
};

function getDb(): BetterSQLite3Database<typeof schema> {
  return (globalForDb.__investDb ??= createDb());
}

// LENIWA inicjalizacja przez Proxy: samo zaimportowanie tego modułu NIE otwiera
// bazy — createDb() (mkdir + open + BOOTSTRAP + migracje) odpala się dopiero przy
// pierwszym realnym użyciu, np. db.select(...). Powód: `next build` zbiera dane
// stron w kilku równoległych procesach roboczych; przy eager-init KAŻDY z nich
// importował ten moduł i tworzył od zera TEN SAM plik SQLite → wyścig o blokadę
// zapisu = "SqliteError: database is locked" (SQLITE_BUSY_SNAPSHOT) i wywalony
// build. Wszystkie trasy czytające bazę są `force-dynamic` / to runtime'owe
// route-handlery, więc podczas builda nikt nie dotyka bazy — plik powstaje
// dopiero w runtime (pojedynczy proces serwera, przez instrumentation.ts).
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});

export * from "./schema";
