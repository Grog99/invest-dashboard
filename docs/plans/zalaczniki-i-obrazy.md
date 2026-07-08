# Załączniki i obrazy w notatkach (punkt roadmapy 5.1)

> Plan wygenerowany przez skill `/plan-feature`. Slug: `zalaczniki-i-obrazy`. Branch: `feature/zalaczniki-i-obrazy` (baza: `main`).

## Kontekst / Problem

Notatki researchowe (`notes`, edytor `src/components/NoteEditor.tsx`) są dziś czystym markdownem
bez możliwości dołączenia obrazu. Użytkownik nie może wkleić zrzutu wykresu, tabeli ze
sprawozdania czy slajdu z prezentacji wynikowej — jedyna droga to zewnętrzny hosting i wklejenie
URL-a, co kłóci się z lokalnym, offline'owym charakterem aplikacji (cała baza + pliki mają żyć
obok siebie w `data/`).

Rozwiązanie (wg roadmapy 5.1): nowa tabela `note_attachments`, pliki na dysku w
`data/attachments/` (obok `data/invest.db`), dwa endpointy (upload multipart + serwowanie pliku)
i wstawianie obrazu do treści notatki jako `![](/api/attachments/123)`. `Markdown.tsx` renderuje
takie obrazy natywnie (react-markdown → `<img>`), więc podgląd notatki działa bez zmian w
rendererze.

Ta iteracja obejmuje **wyłącznie obrazy** (PNG/JPG/WebP/GIF). Obsługa PDF/dokumentów to osobny
punkt roadmapy (4.4 — import raportów okresowych) i świadomie jej tu nie projektujemy.

## Wymagania

- Tabela `note_attachments (id, note_id, filename, mime, size, created_at)`; `note_id` **NOT NULL**,
  FK → `notes.id` z `ON DELETE CASCADE` (usunięcie notatki kasuje wiersze załączników).
- Pliki na dysku w `data/attachments/{id}` (klucz = całkowite `id` wiersza), spójnie z `DATA_DIR`.
- `POST /api/notes/[id]/attachments` — upload multipart (`FormData`), pole pliku; zwraca metadane
  załącznika + gotowy URL do wstawienia.
- `GET /api/attachments/[id]` — serwuje bajty pliku z poprawnym `Content-Type` (z kolumny `mime`),
  `Content-Length`, `Content-Disposition: inline` i długim cache (treść niezmienna dla danego id).
- Dozwolone typy (whitelist): `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Walidacja
  **po stronie serwera** — nie tylko po `file.type`, ale i po magic bytes (nagłówek pliku).
- Limit rozmiaru **10 MB / plik** — wymuszany w UI (przed uploadem) i na serwerze (`413`).
- Przycisk „Dodaj załącznik" w `NoteEditor.tsx` → wybór pliku → po sukcesie link markdown
  `![](/api/attachments/{id})` wstawiany **w miejscu kursora** w textarea.
- Usunięcie notatki kaskadowo usuwa pliki załączników z dysku (brak orphanów po stronie plików).
- `DELETE /api/attachments/[id]` — usuwa wiersz i plik pojedynczego załącznika. W `NoteEditor.tsx`
  minimalny UI: gdy kursor stoi na linii z `![](/api/attachments/{id})`, pojawia się przycisk „Usuń
  obraz", który wywołuje endpoint i usuwa linię z treści.
- Obrazy PNG/JPEG/WebP są przepuszczane przez `sharp` przed zapisem: resize do maks. 2000px na
  dłuższym boku (tylko jeśli większe) + usunięcie metadanych EXIF (domyślne zachowanie `sharp` bez
  `.withMetadata()`). GIF-y zapisywane 1:1 (bez przetwarzania — resize psułby animację).

## Zakres i Non-goals

**W zakresie:**
- Schemat: tabela `note_attachments` (schema Drizzle + `BOOTSTRAP_SQL`).
- Helper `src/lib/attachments.ts` — jedno źródło prawdy dla: ścieżek na dysku (bezpieczne budowanie
  z całkowitego id), whitelisty MIME, sniffingu magic bytes, limitu rozmiaru.
- Endpoint upload `POST /api/notes/[id]/attachments`.
- Endpoint serwowania `GET /api/attachments/[id]`.
- Rozszerzenie `NoteEditor.tsx`: przycisk + ukryty `<input type="file">` + wstawianie markdownu w
  pozycji kursora + wykrywanie linii z załącznikiem pod kursorem + przycisk „Usuń obraz".
- Kaskadowe usuwanie plików w `DELETE /api/notes/[id]`.
- `DELETE /api/attachments/[id]` — usuwanie pojedynczego załącznika (wiersz + plik).
- Resize (maks. 2000px dłuższy bok) + stripowanie EXIF dla PNG/JPEG/WebP przez `sharp` (nowa
  zależność); GIF bez zmian.
- (Opcjonalnie) override komponentu `img` w `Markdown.tsx` — tylko kosmetyka (max-width, zaokrąglenie).

**Non-goals (świadomie pomijamy):**
- PDF / dokumenty / ekstrakcja tekstu — to punkt 4.4, inna iteracja.
- Osobny panel/galeria miniatur załączników pod edytorem — świadomie odrzucone; jedyny sposób
  odnalezienia załącznika to jego referencja `![]()` w treści notatki.
- Pełna reconciliation orphanów (automatyczne wykrywanie i kasowanie plików, których referencja
  zniknęła z treści przez zwykłą edycję tekstu, np. backspace bez użycia przycisku „Usuń obraz") —
  poza tym jednym przypadkiem (usunięcie całej notatki) orphany są akceptowalne w MVP.
- Limit liczby / łącznego rozmiaru załączników per notatka (tylko limit 10 MB/plik).
- Wklejanie zrzutu ze schowka (Ctrl+V) — MVP robi wybór pliku przez przycisk; naturalny follow-up,
  bo reużyje ten sam endpoint uploadu.
- Konwersja formatu obrazu (np. PNG→WebP) — `sharp` re-koduje w tym samym formacie, nie zmienia go.
- Zmiany w `Dockerfile`/`next.config.ts` pod natywny moduł `sharp` — poza zakresem tego planu (patrz
  Ryzyka), do zweryfikowania przy najbliższym buildzie Docker.
- Implementacja backupów (6.4) — tu tylko odnotowujemy, że `data/attachments/` musi zostać objęte
  przyszłym backupem; katalog już jedzie w tym samym wolumenie `data/` co baza.

## Podejście

Minimalny, addytywny moduł spięty z istniejącymi wzorcami. Kluczowe rozstrzygnięcia:

### Reguła `AGENTS.md` — weryfikacja API Next.js (nie „ten" Next, wersja 16.2.10)

Sprawdzono `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` oraz
`.../03-api-reference/03-file-conventions/route.md`. Potwierdzone dla tej wersji:

- **Multipart w Route Handlerze** czyta się przez `const form = await request.formData()` →
  `form.get("file")` zwraca obiekt `File` (Web API). Sekcja „Request Body FormData" — dokładnie
  ten wzorzec. Docs jawnie zaznaczają: w App Routerze **nie** ma `bodyParser`/konfiguracji jak w
  Pages API (sekcja „Webhooks": *„unlike API Routes with the Pages Router, you do not need to use
  `bodyParser`"*). Nie ma też domyślnego limitu rozmiaru body dla route handlerów (limit 1 MB
  dotyczy Server Actions, których **nie** używamy — upload idzie zwykłym `fetch`).
- **Serwowanie pliku (odpowiedź nie-UI)**: `new Response(body, { headers })` z własnym
  `Content-Type` — sekcja „Non-UI Responses" / „Streaming". Body przyjmuje `Buffer`/`Uint8Array`
  (podtyp akceptowany przez `BodyInit`), więc `fs.promises.readFile()` → `new Response(buffer, …)`.
  Ten sam wzorzec `new Response(body, { headers })` jest już w repo w `src/app/api/ai/chat/route.ts`.
- **`context.params` jest Promisem** (`await ctx.params`) — zgodnie z istniejącym
  `src/app/api/notes/[id]/route.ts`. Zachowujemy lokalny typ `type Ctx = { params: Promise<{ id: string }> }`,
  jak w całym repo (nie wprowadzamy globalnego helpera `RouteContext`).

Nie wprowadzamy żadnego nowego wzorca routingu — dokładamy pliki `route.ts` w istniejącej strukturze.

### Format identyfikatora pliku na dysku: `data/attachments/{id}` (bez rozszerzenia)

Klucz na dysku = całkowite `id` wiersza `note_attachments` (autoincrement PK). Uzasadnienie:

- **Bezpieczeństwo (path traversal):** jedynym wejściem do budowy ścieżki jest liczba całkowita,
  więc `../` czy inne znaki specjalne są niemożliwe u źródła. Oryginalny `filename` od użytkownika
  **nigdy** nie trafia do ścieżki na dysku — jest tylko przechowywany w kolumnie `filename` do
  wyświetlania / `Content-Disposition`.
- **Rozszerzenie zbędne dla Content-Type:** `Content-Type` przy serwowaniu bierzemy z kolumny
  `mime` w bazie, więc nie musimy zachowywać rozszerzenia na dysku (odrzucona alternatywa
  `data/attachments/{id}.{ext}` — dokłada parsowanie/mapowanie ext bez zysku; wariant
  `data/attachments/{id}/{filename}` wraca do problemu path traversal w `filename`).
- Zgodne z literalnym zapisem roadmapy `data/attachments/{id}`.

### `DATA_DIR` — jedno źródło prawdy

`DATA_DIR` jest dziś prywatną stałą w `src/db/index.ts:8`
(`process.env.DATA_DIR ?? path.join(process.cwd(), "data")`). Żeby nie zduplikować tej resolucji,
**wyeksportujemy `DATA_DIR`** z `src/db/index.ts` i zaimportujemy w `src/lib/attachments.ts`.
`attachments.ts` udostępni: `ATTACHMENTS_DIR`, `attachmentPath(id: number)` (waliduje, że id to
dodatnia liczba całkowita), whitelistę MIME + `sniffImageMime(buffer)` i stałą limitu 10 MB.
Katalog `data/attachments/` tworzymy leniwie (`fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })`)
przy pierwszym uploadzie — analogicznie do `fs.mkdirSync(DATA_DIR, …)` w `createDb()`.

### Migracja schematu — nowa tabela, bez `ALTER`

To **nowa tabela**, nie kolumna w istniejącej, więc wystarczy dopisać `CREATE TABLE IF NOT EXISTS
note_attachments (...)` do `BOOTSTRAP_SQL` w `src/db/index.ts` — dokładnie tak, jak powstały
wszystkie dotychczasowe tabele. **Nie** potrzeba osobnej funkcji migracyjnej z tanim read-only
guardem (te — `migrateNewsDedup`, `migrateCompanyType` — są wyłącznie dla `ALTER TABLE ... ADD
COLUMN` na istniejących bazach, gdzie N równoległych workerów `next build` rywalizowałoby o blokadę
zapisu WAL). `CREATE TABLE IF NOT EXISTS` jest idempotentne i nie wymaga backfillu, więc jest
bezpieczne pod współbieżnym buildem tak samo jak reszta `BOOTSTRAP_SQL`.

### Walidacja MIME — `file.type` + magic bytes

`file.type` z `FormData` jest ustawiany przez przeglądarkę i **łatwo go sfałszować** (np. request
z `curl`). Dlatego walidujemy dwustopniowo: (1) `file.type` musi być w whiteliście, (2) po wczytaniu
do bufora sprawdzamy sygnaturę (magic bytes) i musi zgadzać się z obrazem z whitelisty. Sniffing
bez zewnętrznej zależności (w `package.json` nie ma `file-type`) — prosta funkcja w
`src/lib/attachments.ts`:

- PNG: `89 50 4E 47 0D 0A 1A 0A`
- JPEG: `FF D8 FF`
- GIF: `47 49 46 38` (`GIF8`)
- WebP: bajty 0–3 `52 49 46 46` (`RIFF`) **oraz** bajty 8–11 `57 45 42 50` (`WEBP`)

Zwracany „prawdziwy" MIME z sniffa zapisujemy do kolumny `mime` (nie ufamy `file.type` przy
serwowaniu). Niezgodność sniffa z whitelistą → `415 Unsupported Media Type`.

### Resize / kompresja / EXIF — `sharp`

Nowa zależność `sharp` (`package.json`). Funkcja `processImage(buf: Buffer, mime: string): Promise<Buffer>`
w `src/lib/attachments.ts`:

- `image/gif` → zwracany bez zmian (resize przez `sharp` bierze domyślnie tylko pierwszą klatkę i
  **psuje animację**; obsługa `{ animated: true }` + re-encode GIF-a to złożoność nieproporcjonalna
  do MVP — GIF-y zwykle i tak są małe, więc pomijanie resize nie koliduje z limitem 10 MB).
- `image/png` / `image/jpeg` / `image/webp` → `sharp(buf, { failOn: "none" })`, odczyt
  `metadata()`; jeśli `width > 2000 || height > 2000` → `.resize({ width: 2000, height: 2000, fit:
  "inside", withoutEnlargement: true })`; zawsze re-encode w tym samym formacie
  (`.png()` / `.jpeg({ quality: 82 })` / `.webp({ quality: 82 })`) → `.toBuffer()`.
- **EXIF:** `sharp` domyślnie **nie** przenosi metadanych do wyniku, dopóki nie wywoła się
  `.withMetadata()` — więc re-encode (nawet bez resize) już usuwa EXIF. Nie potrzeba osobnego kroku.
- Wynikowy bufor (mniejszy niż oryginał przy dużych obrazach) jest tym, co trafia na dysk i którego
  długość zapisujemy w kolumnie `size` — **nie** długość oryginalnego uploadu.
- Błąd `sharp` (uszkodzony/niepełny plik, mimo poprawnych magic bytes) → `422` z komunikatem, bez
  zapisu wiersza/pliku.

### Upload — kolejność operacji (spójność DB ↔ dysk)

Ścieżkę na dysku znamy dopiero po poznaniu `id` (autoincrement). Kolejność:

1. Walidacja: notatka istnieje (`404`), pole `file` obecne i jest `File` (`400`),
   `file.size > 0 && <= 10 MB` (`413`), `file.type` w whiteliście (`415`).
2. Wczytanie bufora: `const buf = Buffer.from(await file.arrayBuffer())`; ponowna walidacja
   `buf.length` względem limitu (obrona, gdyby `file.size` skłamał) + `sniffImageMime(buf)` (`415`).
3. `const processed = await processImage(buf, realMime)` (patrz „Resize / kompresja / EXIF"); błąd
   `sharp` → `422`, przerwij przed insertem.
4. `insert(noteAttachments).values({ noteId, filename, mime: realMime, size: processed.length,
   createdAt }).returning().get()` → mamy `id`.
5. `fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })` + `fs.writeFileSync(attachmentPath(id), processed)`.
6. Jeśli zapis pliku rzuci wyjątek — **rollback**: `db.delete(noteAttachments).where(eq(id))` i
   zwróć `500` (żeby nie zostawić wiersza bez pliku).
7. Odpowiedź: `{ attachment: { id, filename, mime: realMime, size: processed.length }, url:
   "/api/attachments/{id}" }`.

### Usuwanie pojedynczego załącznika — `DELETE /api/attachments/[id]` + minimalny UI

Zamiast pełnej galerii (odrzucona w rundzie pytań), minimalny UI oparty o pozycję kursora:

- W `NoteEditor.tsx`: `onSelect`/`onClick`/`onKeyUp` na `<textarea>` przelicza bieżącą linię z
  `selectionStart` (podział `content` po `\n`, znalezienie linii zawierającej offset kursora).
  Regex `/^!\[[^\]]*\]\(\/api\/attachments\/(\d+)\)\s*$/` testowany na tej linii → jeśli pasuje,
  `activeAttachmentId` w stanie ustawiony na wyciągnięte `id`; inaczej `null`.
- Gdy `activeAttachmentId !== null`, obok przycisku „Dodaj załącznik" pojawia się „Usuń obraz"
  (ten sam styl `Button`, `variant="secondary"`, kolor destrukcyjny jeśli dostępny w `ui.tsx`).
- Klik: `DELETE /api/attachments/{activeAttachmentId}` → po `200` usunięcie **całej dopasowanej
  linii** z `content` (nie tylko fragmentu), `setContent(next)`, reset `activeAttachmentId`.
- Endpoint `DELETE /api/attachments/[id]`: wiersz istnieje (`404` jeśli nie), `fs.unlink` (ignoruj
  `ENOENT`), `db.delete(noteAttachments).where(eq(id))`, `200`. Bez sprawdzania, czy wywołujący ma
  „prawo" do notatki — aplikacja jest jednoużytkownikowa/lokalna, brak warstwy auth (spójne z resztą
  API).

### Serwowanie — `GET /api/attachments/[id]`

1. `id = Number(...)`; jeśli nie jest dodatnią liczbą całkowitą → `404`.
2. `noteAttachments` po `id` → brak wiersza → `404`.
3. `fs.promises.readFile(attachmentPath(id))`; `ENOENT` (plik zniknął z dysku) → `404`.
4. `new Response(buffer, { headers })` z:
   - `Content-Type: {mime}` (z bazy),
   - `Content-Length: {size}`,
   - `Content-Disposition: inline; filename="{filename}"` (obraz ma się renderować w markdown, a
     nie wymuszać pobrania; nazwa do „zapisz jako"),
   - `Cache-Control: public, max-age=31536000, immutable` (treść dla danego id jest niezmienna —
     nowy upload = nowe id, więc cache bez ryzyka nieświeżości).
   - Dla `id` mniejszego niż 10 MB wczytanie całości do pamięci jest w porządku (lokalna aplikacja);
     streaming (`fs.createReadStream` → `Readable.toWeb`) opcjonalny, nie w MVP.

### Wstawianie markdownu w pozycji kursora

`NoteEditor` trzyma `content` w stanie i renderuje **kontrolowaną** `<textarea>` (linie 161–167),
ale nie ma dziś `ref` ani śledzenia kursora. Zmiany:

- `const textareaRef = useRef<HTMLTextAreaElement>(null)` + `ref={textareaRef}` na `<textarea>`.
- Helper `insertAtCursor(snippet: string)`: odczytuje `selectionStart/selectionEnd` z
  `textareaRef.current`, składa `content.slice(0, start) + snippet + content.slice(end)`, ustawia
  `setContent(next)`, a po renderze przywraca focus i kursor tuż za wstawionym tekstem
  (`requestAnimationFrame` + `setSelectionRange`). Fallback (brak refa / tryb podglądu): doklej na
  koniec `content`.
- Ukryty `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ref={fileInputRef}>`
  + przycisk „Dodaj załącznik" (reużyj `Button` z `ui.tsx`, `size="sm" variant="secondary"`),
  obok istniejącego „✦ Generuj analizę AI" (linie 141–149).
- `onChange` inputu: walidacja rozmiaru w UI (`file.size > 10 MB` → komunikat, przerwij), `POST`
  `FormData` na `/api/notes/{note.id}/attachments`, po sukcesie
  `insertAtCursor("![](" + data.url + ")\n")` i reset `input.value = ""` (by dało się wgrać ten sam
  plik ponownie). Stan `uploadBusy` blokujący przycisk podczas wysyłki, komunikaty przez istniejące
  `setMessage`.
- **Wymóg: notatka musi być zapisana** (upload potrzebuje `note.id` w URL). Na stronie „nowa
  notatka" (`src/app/research/new/page.tsx`) `note` jest `undefined` do pierwszego zapisu. MVP:
  przycisk „Dodaj załącznik" **disabled gdy `!note`** z tooltipem „Zapisz notatkę, aby dodać
  załącznik" — analogicznie do tego, jak „Generuj analizę AI" jest disabled bez wybranej spółki
  (linia 145). Alternatywa (auto-zapis przed uploadem) — patrz Pytania.

### Kaskadowe usuwanie plików

`DELETE /api/notes/[id]` (`src/app/api/notes/[id]/route.ts:42`) dziś tylko kasuje wiersz notatki.
Rozszerzenie: **przed** usunięciem notatki pobrać `id` wszystkich jej załączników
(`select({ id }).from(noteAttachments).where(eq(noteId))`), usunąć notatkę (FK `ON DELETE CASCADE`
sprząta wiersze `note_attachments`), a następnie skasować pliki z dysku po zebranych id, każdy w
`try/catch` ignorującym `ENOENT` (plik mógł już nie istnieć — nie przerywamy pętli). Kolejność
„pobierz id → delete notatki → unlink plików" jest bezpieczna, bo id mamy już w pamięci.

## Pliki do zmiany

- **`src/db/schema.ts`** — nowa tabela `noteAttachments`:
  ```
  export const noteAttachments = sqliteTable("note_attachments", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noteId: integer("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at").notNull(),
  });
  ```
  Dodać `export type NoteAttachment = typeof noteAttachments.$inferSelect;` (jak inne typy na końcu
  pliku). Reużyj: konwencja `references(() => notes.id, { onDelete: "cascade" })` — jak w
  `transactions`/`dividends`. **Uwaga:** `notes.companyId` ma `ON DELETE SET NULL` (notatka
  przeżywa usunięcie spółki), ale `note_attachments.noteId` **musi** być `ON DELETE CASCADE`
  (załącznik nie istnieje bez notatki).

- **`src/db/index.ts`** — dwie rzeczy:
  1. Do `BOOTSTRAP_SQL` (po bloku `notes`) dopisać:
     ```
     CREATE TABLE IF NOT EXISTS note_attachments (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
       filename TEXT NOT NULL,
       mime TEXT NOT NULL,
       size INTEGER NOT NULL,
       created_at TEXT NOT NULL
     );
     CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);
     ```
     (indeks pod pobieranie/kasowanie po `note_id`). Bez osobnej funkcji migracyjnej — patrz
     „Podejście / Migracja".
  2. Wyeksportować stałą ścieżki: `export const DATA_DIR` (dziś prywatna, linia 8) — jedno źródło
     prawdy reużywane przez `src/lib/attachments.ts`.

- **`package.json`** — dodać zależność `sharp` (`npm install sharp`).

- **`src/lib/attachments.ts`** (nowy) — centralny, security-krytyczny helper:
  - `import { DATA_DIR } from "@/db"` (lub bezpośrednio z `@/db/index`), `export const ATTACHMENTS_DIR = path.join(DATA_DIR, "attachments")`.
  - `attachmentPath(id: number): string` — waliduje `Number.isInteger(id) && id > 0` (rzuca przy
    złym id), zwraca `path.join(ATTACHMENTS_DIR, String(id))`.
  - `export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;`
  - `export const ALLOWED_IMAGE_MIME = new Set(["image/png","image/jpeg","image/webp","image/gif"]);`
  - `sniffImageMime(buf: Buffer): string | null` — magic bytes (patrz „Podejście / Walidacja MIME").
  - `processImage(buf: Buffer, mime: string): Promise<Buffer>` — resize + strip EXIF przez `sharp`
    (patrz „Podejście / Resize / kompresja / EXIF"); GIF pass-through.
  - `ensureAttachmentsDir()` — `fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })`.

- **`src/app/api/notes/[id]/attachments/route.ts`** (nowy) — `POST`:
  - `type Ctx = { params: Promise<{ id: string }> }` (jak reszta repo); `const { id } = await ctx.params`.
  - Sprawdź istnienie notatki (`db.select().from(notes).where(eq(notes.id, noteId)).get()` → `404`).
  - `const form = await req.formData(); const file = form.get("file");` — `file instanceof File`
    (`400` gdy brak/zły typ pola).
  - Walidacja rozmiaru (`413`), `file.type` w `ALLOWED_IMAGE_MIME` (`415`), sniff bufora (`415`),
    `processImage` (`422` przy błędzie dekodowania).
  - Insert → id → zapis pliku → rollback przy błędzie I/O (patrz „Podejście / Upload").
  - Reużyj: `nowISO` (`@/lib/format`), helpery z `@/lib/attachments`, wzorzec `NextResponse.json({...}, { status })`
    z istniejących handlerów.

- **`src/app/api/attachments/[id]/route.ts`** (nowy) — `GET` + `DELETE`:
  - `GET`: serwowanie pliku (patrz „Podejście / Serwowanie"). Reużyj: `attachmentPath`, wzorzec
    `new Response(body, { headers })` z `src/app/api/ai/chat/route.ts`.
  - `DELETE`: usuwa wiersz + plik pojedynczego załącznika (patrz „Podejście / Usuwanie pojedynczego
    załącznika"). `404` jeśli wiersz nie istnieje; `fs.unlink` z ignorowaniem `ENOENT`.

- **`src/app/api/notes/[id]/route.ts`** — w `DELETE` (linia 42) dodać kaskadowe kasowanie plików:
  pobrać id załączników przed usunięciem notatki, po delete odpętlić i `fs.unlink` (ignorując
  `ENOENT`). Importy: `noteAttachments` z `@/db`, `attachmentPath` z `@/lib/attachments`, `fs`.

- **`src/components/NoteEditor.tsx`** — przycisk „Dodaj załącznik" + ukryty file input + `textareaRef`
  + `insertAtCursor` + handler uploadu (patrz „Podejście / Wstawianie markdownu"); plus wykrywanie
  linii załącznika pod kursorem + przycisk „Usuń obraz" wywołujący `DELETE` (patrz „Podejście /
  Usuwanie pojedynczego załącznika"). Reużyj: `Button` z `./ui`, istniejące
  `useState`/`setMessage`/`setBusy`. Przycisk „Dodaj załącznik" disabled gdy `!note`.

- **`src/components/Markdown.tsx`** (opcjonalnie) — override komponentu `img` w `ReactMarkdown`
  (`components={{ img: (props) => <img {...props} className="max-w-full rounded-lg border border-border" /> }}`),
  żeby wgrane zrzuty nie wychodziły poza kolumnę i miały spójny wygląd. Renderowanie
  `![](/api/attachments/123)` działa i bez tego (react-markdown → natywny `<img>`) — to czysta
  kosmetyka. Reużyj: klasy Tailwch z reszty UI (`border-border`, `rounded-lg`).

## Kryteria akceptacji

- [ ] Świeża baza (`DATA_DIR` na pusty katalog) tworzy tabelę `note_attachments` z `BOOTSTRAP_SQL`;
      istniejąca baza dostaje ją przy starcie (`CREATE TABLE IF NOT EXISTS`) bez błędu i bez
      `SQLITE_BUSY` pod równoległym `next build`.
- [ ] Upload obrazu (PNG/JPG/WebP/GIF ≤ 10 MB) na zapisanej notatce zwraca `200` z
      `url: "/api/attachments/{id}"`; plik pojawia się w `data/attachments/{id}`, wiersz w
      `note_attachments`.
- [ ] `GET /api/attachments/{id}` zwraca bajty z poprawnym `Content-Type` (zgodnym z realnym typem
      pliku, nie z `file.type`), `Content-Length` i nagłówkiem cache; obraz wyświetla się w
      podglądzie notatki (`![](/api/attachments/{id})`).
- [ ] Po uploadzie link `![](...)` jest wstawiony **w miejscu kursora** w textarea (nie tylko na
      końcu), kursor ląduje za wstawionym tekstem.
- [ ] Plik > 10 MB jest odrzucony zarówno w UI (przed wysyłką), jak i na serwerze (`413`).
- [ ] Plik nie-obraz albo obraz z podmienionym `file.type` (np. `.exe` podany jako `image/png`)
      jest odrzucony na serwerze po sniffie magic bytes (`415`).
- [ ] Przycisk „Dodaj załącznik" jest nieaktywny na stronie „Nowa notatka" do pierwszego zapisu
      (tooltip informujący dlaczego).
- [ ] Usunięcie notatki z załącznikami kasuje wiersze `note_attachments` (kaskada FK) **i** pliki z
      `data/attachments/` (brak orphanów plikowych); usunięcie notatki, której plik już zniknął z
      dysku, nie rzuca błędem.
- [ ] Żądanie `GET /api/attachments/{id}` z nieistniejącym / nie-całkowitym id zwraca `404` (brak
      path traversal — potwierdzić, że `../` w ścieżce jest niemożliwe, bo klucz to liczba).
- [ ] Duży PNG/JPEG/WebP (np. > 2000px na dłuższym boku) po uploadzie ma zmniejszony rozmiar na
      dysku (resize) i nie zawiera EXIF-a (weryfikacja np. przez `exiftool`/metadata w devtoolsach);
      GIF pozostaje bez zmian (animacja zachowana).
- [ ] Kursor postawiony na linii `![](/api/attachments/{id})` w textarze pokazuje przycisk „Usuń
      obraz"; klik usuwa plik z dysku, wiersz z bazy i linię z treści notatki.
- [ ] `DELETE /api/attachments/{id}` dla nieistniejącego id zwraca `404`; dla istniejącego —
      usuwa plik (ignorując `ENOENT`, jeśli już zniknął) i wiersz, zwraca `200`.
- [ ] `npm run lint` i `npm run build` przechodzą (w tym build natywnego modułu `sharp`).
- [ ] Aplikacja odpala się i feature działa w preview.

## Ryzyka

- **Path traversal (krytyczne).** Ścieżka pliku MUSI być budowana wyłącznie z całkowitego `id`
  (`attachmentPath` waliduje `Number.isInteger(id) && id > 0`). Oryginalny `filename` od użytkownika
  nigdy nie wchodzi do ścieżki na dysku — tylko do kolumny `filename`/`Content-Disposition`. To jest
  główny powód wyboru formatu `data/attachments/{id}` bez rozszerzenia.
- **Spójność DB ↔ dysk.** Insert wiersza i zapis pliku to dwie operacje. Kolejność „insert → zapis →
  rollback wiersza przy błędzie I/O" (patrz Podejście) zapobiega wierszom bez pliku. Odwrotny
  orphan (plik bez wiersza) możliwy tylko przy crashu między krokami 3–4 — akceptowalne dla
  lokalnej aplikacji (osierocony plik nie jest serwowany, bo nie ma wiersza).
- **Fałszowalny `file.type`.** Przeglądarkowy MIME jest niezaufany — stąd obowiązkowy sniff magic
  bytes i zapis „prawdziwego" MIME do bazy. Bez tego można by podać dowolny plik jako obraz.
- **Limit 10 MB w dwóch miejscach.** UI (przed wysyłką, dla szybkiego feedbacku) **i** serwer
  (twardy `413`, bo UI da się ominąć). `formData()` buforuje całe body w pamięci — przy 10 MB i
  lokalnym użyciu to akceptowalne; nie podnosić limitu bez przemyślenia pamięci.
- **`note_id` NOT NULL — załącznik zawsze wymaga notatki.** Notatki mogą mieć `company_id = NULL`
  (notatka ogólna — `notes.companyId` nullable, `ON DELETE SET NULL`), ale załącznik przypina się do
  **notatki**, nie do spółki, więc `note_id` może i powinno być NOT NULL. Zgodne z opisem roadmapy.
  Konsekwencja: upload wymaga wcześniej zapisanej notatki (obsłużone: disabled przycisk w trybie
  „nowa notatka").
- **Orphany plikowe przy edycji treści.** Jeśli użytkownik usunie linię `![](/api/attachments/{id})`
  ręcznie (np. backspace, zaznaczenie i delete) zamiast przyciskiem „Usuń obraz", plik i wiersz
  zostają (sprzątane dopiero przy usunięciu całej notatki). Przycisk „Usuń obraz" pokrywa tylko
  przypadek, gdy użytkownik świadomie go użyje z kursorem na właściwej linii — pełna reconciliation
  (parsowanie treści i porównanie z listą załączników) jest poza zakresem MVP.
- **Natywny moduł `sharp` w Dockerze.** Deployment (6.3, już zrobiony) używa `node:22-bookworm-slim`
  + `output: "standalone"` z ręcznie dodanym `outputFileTracingIncludes` dla natywnego pliku
  `better-sqlite3`. `sharp` to kolejny natywny moduł (libvips) — zwykle ma prebuildy dla
  `linux-x64`/glibc i **nie** wymaga `python3 make g++` jak budowanie od zera, ale (a) trzeba
  sprawdzić, czy `next build` w trybie standalone poprawnie zbiera pliki `sharp`/`@img/sharp-*` do
  `outputFileTracingIncludes` (analogicznie do wpisu dla `better-sqlite3` w `next.config.ts`), (b)
  warto zweryfikować obraz Dockera end-to-end po dodaniu zależności (jak przy 6.3). To ryzyko
  dotyczy **wdrożenia**, nie samej funkcjonalności lokalnie — do zweryfikowania w kroku weryfikacji
  tego planu (`npm run build` lokalnie wystarczy na tym etapie; test Dockera to osobny krok, poza
  tym planem).
- **Backupy (6.4).** `data/attachments/` musi zostać objęte przyszłym mechanizmem backupu bazy —
  dziś katalog jedzie w tym samym wolumenie `data/` (Docker montuje `/app/data`, `.gitignore`
  i `.dockerignore` wykluczają `data/`), więc kopia całego `data/` obejmie i bazę, i załączniki.
  Tu **nie** implementujemy backupów — tylko odnotowujemy zależność.
- **Cache serwowanego pliku.** `immutable` + długi `max-age` są bezpieczne, bo treść dla danego id
  nigdy się nie zmienia (nowy upload = nowe id). Gdyby kiedyś dopuścić „podmień plik pod tym samym
  id" — trzeba by zmienić strategię cache.
- **Reguła `AGENTS.md`.** Multipart/serwowanie plików to obszary, gdzie łatwo o założenia z pamięci
  (bodyParser, `res.send`, statyczne serwowanie z `public/`). Zweryfikowano w docs tej wersji Next —
  `request.formData()` + `new Response(buffer, { headers })`, bez konfiguracji bodyParser (patrz
  Podejście). Nie serwujemy z `public/` (pliki są w `data/`, poza buildem — i słusznie, bo `data/`
  jest gitignorowane i wykluczone z obrazu Dockera).

## Pytania do doprecyzowania

Brak otwartych pytań — wszystkie rozstrzygnięte w rundzie doprecyzowania i wpisane do sekcji
„Zakres i Non-goals" / „Podejście". Świadomie odłożone na później (patrz Non-goals): Ctrl+V,
dodatkowy limit per notatka, pełna reconciliation orphanów, zmiany w Dockerfile pod `sharp`.
