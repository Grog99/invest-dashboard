export const meta = {
  name: 'implement-layered',
  description: 'Implementuje feature z planu warstwami: dane -> API -> UI, z handoffem schematu miedzy warstwami i petla weryfikacji lint+build',
  whenToUse: 'Gdy plan (docs/plans/<slug>.md) jest zaakceptowany i chcesz zaimplementowac feature warstwowo z deterministycznym porzadkiem i strukturyzowanym przekazaniem kontekstu miedzy warstwami.',
  phases: [
    { title: 'Warstwa danych', detail: 'schema Drizzle, CREATE TABLE w bootstrapie, czyste funkcje w src/lib', model: 'sonnet' },
    { title: 'Warstwa API', detail: 'route handlery na bazie warstwy danych', model: 'sonnet' },
    { title: 'Warstwa UI', detail: 'komponenty i strony konsumujace API (mobile 360-390px)', model: 'sonnet' },
    { title: 'Weryfikacja', detail: 'npm run lint + npm run build, ograniczona petla napraw', model: 'sonnet' },
  ],
}

// --- Wejscie ze skilla: { planPath, layers } ---
// planPath: sciezka do docs/plans/<slug>.md
// layers:   podzbior ['dane','api','ui'] w kolejnosci; puste => wszystkie trzy
const planPath = args && args.planPath
if (!planPath) throw new Error('args.planPath jest wymagane (sciezka do pliku planu)')
const wanted = (args && Array.isArray(args.layers) && args.layers.length) ? args.layers : ['dane', 'api', 'ui']
const present = new Set(wanted)

// --- Reguly wspolne (wstrzykiwane w prompty) ---
const NEXT_RULE = [
  'Regula z AGENTS.md: to NIE jest Next.js z treningu. Zanim zalozysz JAKIEKOLWIEK API Next.js',
  '(route handlery, dynamiczne [id]/params, segment config, useRouter), przeczytaj wlasciwy plik',
  'w node_modules/next/dist/docs/ oraz sprawdz istniejacy wzorzec w repo (np. src/app/api/transactions/).',
].join(' ')
const REUSE_RULE = 'Reuzywaj istniejace utility/komponenty wskazane w planie zamiast pisac od zera. Przeczytaj AGENTS.md i CLAUDE.md. Prowadz wlasna todo-liste dla wieloetapowej pracy.'

// --- Schematy handoffu miedzy warstwami ---
const DATA_SCHEMA = {
  type: 'object',
  required: ['summary', 'files'],
  properties: {
    summary: { type: 'string', description: 'Co powstalo w warstwie danych' },
    tables: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'columns'],
        properties: {
          name: { type: 'string' },
          columns: { type: 'array', items: { type: 'string' }, description: 'np. "direction TEXT", "volume REAL"' },
        },
      },
    },
    exports: { type: 'array', items: { type: 'string' }, description: 'Typy i funkcje z sygnaturami, np. "computeCfdPositions(): { positions, totalCfdPnlPln }"' },
    files: { type: 'array', items: { type: 'string' } },
    notesForApi: { type: 'string', description: 'Co warstwa API musi wiedziec (nazwy funkcji, ksztalt danych)' },
  },
}
const API_SCHEMA = {
  type: 'object',
  required: ['summary', 'files'],
  properties: {
    summary: { type: 'string' },
    endpoints: {
      type: 'array',
      items: {
        type: 'object',
        required: ['method', 'path'],
        properties: {
          method: { type: 'string' },
          path: { type: 'string' },
          responseShape: { type: 'string', description: 'np. "{ id, symbol, pnl }[]"' },
          bodyShape: { type: 'string', description: 'ksztalt body dla POST/PATCH' },
        },
      },
    },
    files: { type: 'array', items: { type: 'string' } },
    notesForUi: { type: 'string', description: 'Co warstwa UI musi wiedziec (endpointy, ksztalty, kody bledow)' },
  },
}
const UI_SCHEMA = {
  type: 'object',
  required: ['summary', 'files'],
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    routes: { type: 'array', items: { type: 'string' }, description: 'Strony/sciezki dotkniete zmiana' },
    mobileChecked: { type: 'boolean', description: 'Czy widok kartowy dziala na ~360-390px' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object',
  required: ['lintPass', 'buildPass'],
  properties: {
    lintPass: { type: 'boolean' },
    buildPass: { type: 'boolean' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
}
const REPAIR_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
  },
}

// wspolne opcje agenta implementujacego (general-purpose => ma Edit/Write/Bash)
const impl = (label, phaseTitle, schema) => ({ label, phase: phaseTitle, schema, agentType: 'general-purpose', model: 'sonnet', effort: 'high' })

let data = null
let api = null
let ui = null

// --- Warstwa 1: dane (Baza + Logika) ---
if (present.has('dane')) {
  phase('Warstwa danych')
  data = await agent(
    [
      `Przeczytaj plan: ${planPath}. Zaimplementuj TYLKO warstwe danych: sekcje "Baza (warstwa danych)" i logike domenowa w src/lib/`,
      'z sekcji "Pliki do zmiany" (schema Drizzle w src/db/schema.ts, CREATE TABLE IF NOT EXISTS w bootstrapie src/db/index.ts,',
      'czyste funkcje liczace w src/lib/, ewentualny potok odswiezania cen). NIE dotykaj route handlerow ani UI.',
      'Nowa tabela wylacznie przez CREATE TABLE IF NOT EXISTS w BOOTSTRAP_SQL — zadnych ALTER/zapisow na poziomie importu modulu (patrz komentarze o SQLITE_BUSY w src/db/index.ts).',
      REUSE_RULE,
      NEXT_RULE,
      'Zwroc strukture: utworzone/zmienione tabele z kolumnami, wyeksportowane typy i funkcje (z sygnaturami), liste zmienionych plikow oraz uwagi dla warstwy API (notesForApi).',
    ].join('\n'),
    impl('impl:dane', 'Warstwa danych', DATA_SCHEMA)
  )
}

// --- Warstwa 2: API (dostaje KONKRET z warstwy danych) ---
if (present.has('api')) {
  phase('Warstwa API')
  api = await agent(
    [
      `Przeczytaj plan: ${planPath}, sekcja "API (warstwa API)" z "Pliki do zmiany". Zaimplementuj TYLKO route handlery.`,
      data ? `Warstwa danych JEST GOTOWA — uzyj DOKLADNIE tych tabel, typow i funkcji (nie zgaduj nazw ani sygnatur):\n${JSON.stringify(data, null, 2)}` : 'Warstwa danych nie byla czescia tej orkiestracji — oprzyj sie na istniejacym kodzie i planie.',
      REUSE_RULE,
      NEXT_RULE,
      'Zwroc: liste endpointow (metoda, sciezka, ksztalt request/response), zmienione pliki oraz uwagi dla warstwy UI (notesForUi).',
    ].join('\n'),
    impl('impl:api', 'Warstwa API', API_SCHEMA)
  )
}

// --- Warstwa 3: UI (dostaje konkret z API, a gdy brak API to z warstwy danych) ---
if (present.has('ui')) {
  phase('Warstwa UI')
  ui = await agent(
    [
      `Przeczytaj plan: ${planPath}, sekcja "UI (warstwa UI)" z "Pliki do zmiany". Zaimplementuj TYLKO komponenty i strony.`,
      api ? `API JEST GOTOWE — wolaj dokladnie te endpointy i ksztalty:\n${JSON.stringify(api.endpoints || api, null, 2)}\nUwagi dla UI: ${api.notesForUi || '(brak)'}` : '',
      (data && !api) ? `Warstwa danych/logiki JEST GOTOWA:\n${JSON.stringify(data, null, 2)}` : '',
      REUSE_RULE,
      'WYMOG z AGENTS.md: responsywnosc mobilna — widok kartowy zamiast tabeli na ~360-390px, aplikacja ma dolna nawigacje mobilna. Reuzyj komponenty z src/components/ui.tsx i skopiuj wzorzec kartowy z istniejacych stron (hidden md:block + space-y-2 md:hidden). Ustaw mobileChecked=true tylko jesli faktycznie zadbales o wariant mobilny.',
      NEXT_RULE,
      'Zwroc: zmienione pliki, dotkniete sciezki/strony i krotki opis co powstalo.',
    ].filter(Boolean).join('\n'),
    impl('impl:ui', 'Warstwa UI', UI_SCHEMA)
  )
}

// --- Weryfikacja + ograniczona petla napraw (lint + build; e2e/preview zostaje glownemu agentowi) ---
phase('Weryfikacja')
let verify = null
const MAX_ROUNDS = 3
for (let round = 1; round <= MAX_ROUNDS; round++) {
  verify = await agent(
    [
      'Uruchom po kolei `npm run lint`, a nastepnie `npm run build` (build robi rowniez typecheck).',
      'NIE naprawiaj bledow — tylko raportuj. Zwroc lintPass/buildPass oraz pelna liste bledow (plik + komunikat).',
      'Uwaga: build importuje trasy w wielu workerach — bledy typu SQLITE_BUSY oznaczaja zapis na poziomie modulu, zglos je.',
    ].join('\n'),
    { label: `verify:r${round}`, phase: 'Weryfikacja', schema: VERIFY_SCHEMA, agentType: 'general-purpose', model: 'sonnet' }
  )
  if (verify && verify.lintPass && verify.buildPass) {
    log(`Weryfikacja zielona w rundzie ${round}`)
    break
  }
  if (round === MAX_ROUNDS) {
    log(`Weryfikacja nadal czerwona po ${round} rundach — przekazuje bledy glownemu agentowi`)
    break
  }
  log(`Runda ${round}: lint/build czerwone (${(verify && verify.errors ? verify.errors.length : '?')} bledow) — deleguje naprawe`)
  await agent(
    [
      `Napraw bledy lint/build powstale przy implementacji feature (plan: ${planPath}).`,
      `Bledy do naprawy:\n${JSON.stringify(verify.errors || [], null, 2)}`,
      `Kontekst zaimplementowanych warstw:\n${JSON.stringify({ data, api, ui }, null, 2)}`,
      NEXT_RULE,
      'Zmien tylko to, co konieczne, zeby `npm run lint` i `npm run build` przeszly. NIE zmieniaj zachowania feature ani zakresu z planu.',
    ].join('\n'),
    { label: `repair:r${round}`, phase: 'Weryfikacja', schema: REPAIR_SCHEMA, agentType: 'general-purpose', model: 'sonnet', effort: 'high' }
  )
}

return { planPath, layers: [...present], data, api, ui, verify }
