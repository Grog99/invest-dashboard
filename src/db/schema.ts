import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Typ instrumentu — steruje sugestią symbolu Yahoo i udziałem w silniku portfela.
export const INSTRUMENT_TYPES = ["STOCK", "ETF", "INDEX"] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

// Spółki — zarówno posiadane (mają transakcje), jak i obserwowane (watchlist = 1).
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  name: text("name").notNull(),
  market: text("market").notNull().default("GPW"), // GPW | US | OTHER
  currency: text("currency").notNull().default("PLN"),
  quoteSymbol: text("quote_symbol").notNull(), // symbol Yahoo, np. "PKN.WA", "AAPL"
  watchlist: integer("watchlist").notNull().default(0),
  // Dodatkowe słowa kluczowe (po przecinku) do dopasowywania newsów, np. "Orlen,PKN Orlen"
  aliases: text("aliases"),
  type: text("type").notNull().default("STOCK"), // STOCK | ETF | INDEX
  createdAt: text("created_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // BUY | SELL
  date: text("date").notNull(), // YYYY-MM-DD
  quantity: real("quantity").notNull(),
  price: real("price").notNull(), // w walucie spółki
  commission: real("commission").notNull().default(0), // w walucie spółki
  note: text("note"),
});

export const dividends = sqliteTable("dividends", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  amount: real("amount").notNull(), // brutto, w walucie spółki
  taxWithheld: real("tax_withheld").notNull().default(0),
  note: text("note"),
});

export const quotesLatest = sqliteTable("quotes_latest", {
  companyId: integer("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  price: real("price").notNull(),
  prevClose: real("prev_close"),
  date: text("date"),
  time: text("time"),
  updatedAt: text("updated_at").notNull(),
});

export const quotesDaily = sqliteTable(
  "quotes_daily",
  {
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    open: real("open"),
    high: real("high"),
    low: real("low"),
    close: real("close").notNull(),
    volume: real("volume"),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.date] })]
);

// Kursy średnie NBP (tabela A), jeden wiersz na walutę i datę publikacji.
export const fxRates = sqliteTable(
  "fx_rates",
  {
    currency: text("currency").notNull(),
    date: text("date").notNull(),
    rate: real("rate").notNull(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.date] })]
);

export const newsSources = sqliteTable("news_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  // null = źródło globalne (newsy dopasowywane po słowach kluczowych),
  // ustawione = wszystkie wpisy przypisywane do tej spółki
  companyId: integer("company_id").references(() => companies.id, {
    onDelete: "cascade",
  }),
  enabled: integer("enabled").notNull().default(1),
  lastFetchedAt: text("last_fetched_at"),
  lastError: text("last_error"),
});

export const newsItems = sqliteTable(
  "news_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id").references(() => newsSources.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    url: text("url").notNull().unique(),
    summary: text("summary"),
    publishedAt: text("published_at"),
    read: integer("read").notNull().default(0),
    createdAt: text("created_at").notNull(),
    // Klucz deduplikacji: lower(trim(title)) + '|' + published_at.slice(0,10),
    // liczony w JS przez computeDedupKey() (src/lib/format.ts) — patrz
    // migrateNewsDedup() w src/db/index.ts. null gdy brak published_at.
    dedupKey: text("dedup_key"),
  },
  (t) => [uniqueIndex("idx_news_dedup").on(t.dedupKey)]
);

// Dopasowanie news ↔ spółka (jeden news może dotyczyć wielu spółek).
export const newsCompany = sqliteTable(
  "news_company",
  {
    newsId: integer("news_id")
      .notNull()
      .references(() => newsItems.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.companyId] })]
);

// Notatki researchowe — markdown; companyId = null to notatka ogólna.
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Załączniki (obrazy) notatek — plik na dysku w data/attachments/{id}
// (src/lib/attachments.ts). noteId NOT NULL + CASCADE: załącznik nie
// istnieje bez notatki (w przeciwieństwie do notes.companyId, które jest
// nullable — notatka przeżywa usunięcie spółki).
export const noteAttachments = sqliteTable("note_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: integer("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
});

export type Company = typeof companies.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Dividend = typeof dividends.$inferSelect;
export type QuoteLatest = typeof quotesLatest.$inferSelect;
export type QuoteDaily = typeof quotesDaily.$inferSelect;
export type NewsSource = typeof newsSources.$inferSelect;
export type NewsItem = typeof newsItems.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteAttachment = typeof noteAttachments.$inferSelect;
