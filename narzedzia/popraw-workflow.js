#!/usr/bin/env node
/*
 * Hurtowe poprawki w eksportach Automy — punkty 5, 6 i 8 z ANALIZA-PETLI.md
 * plus limit pobierania z punktu 2.
 *
 * Cztery niezależne zmiany:
 *
 *  [element-exists]  punkt 5 — bloki `Element exists` odpytują DOM co 5 ms
 *      (200 zapytań na sekundę). Odstęp idzie na 500 ms, a liczba prób jest
 *      przeliczana tak, żeby ŁĄCZNY czas czekania został bez zmian —
 *      z dolną granicą 20 s i górną 5 min (80 000 × 5 ms to było 6 min 40 s).
 *
 *  [retry]           punkt 6 — bloki klikające, wgrywające, wypełniające
 *      formularze i pobierające mają `retry: false`, więc pierwsze potknięcie
 *      od razu spycha workflow w gałąź `fallback`. Włącza ponawianie
 *      (3 próby co 2 s). Blokom, które w ogóle nie mają obsługi błędu,
 *      dokłada ją z akcją `error` — czyli zachowuje ich dotychczasowe
 *      zachowanie po wyczerpaniu prób, tylko dodaje same próby.
 *
 *  [ustawienia]      punkt 8 — `execContext: popup` → `background`
 *      (workflow przestaje umierać razem z zamknięciem popupu rozszerzenia)
 *      oraz `blockDelay: 0` → 300 ms (oddech między blokami).
 *
 *  [download]        punkt 2 — `Handle download` czeka na plik 1 s.
 *      Limit idzie na 30 s.
 *
 * Zmienia wyłącznie wymienione pola. Selektory, połączenia, kolejność bloków
 * i teksty pozostają nietknięte. Obejmuje też kopie workflow zaszyte
 * w `includedWorkflows`.
 *
 * Użycie:
 *   node narzedzia/popraw-workflow.js <plik.json|katalog> [...] [opcje]
 *
 * Opcje:
 *   --out <katalog>     gdzie zapisać (domyślnie: ./poprawione)
 *   --pomin <nazwy>     które poprawki pominąć, po przecinku
 *                       (element-exists, retry, ustawienia, download)
 *   --proby <n>         liczba prób ponowienia (domyślnie 3)
 *   --odstep <s>        odstęp między próbami w sekundach (domyślnie 2)
 *   --opoznienie <ms>   blockDelay (domyślnie 300)
 *   --pobieranie <ms>   limit Handle download (domyślnie 30000)
 *   --dry-run           tylko pokaż, co by się zmieniło
 */

const fs = require('fs');
const path = require('path');

/* ====== konfiguracja ====== */
const KONF = {
  out: 'poprawione',
  pomin: new Set(),
  proby: 3,
  odstep: 2,
  opoznienie: 300,
  pobieranie: 30000,
  dryRun: false,
  wejscia: [],
};

/* Element exists: docelowy odstęp między próbami oraz widełki łącznego czekania */
const EE_ODSTEP_MS = 500;
const EE_MIN_MS = 20000;
const EE_MAX_MS = 300000;

/* bloki, które faktycznie coś robią na stronie — tylko im dokładamy ponawianie */
const BLOKI_DO_PONAWIANIA = new Set(['event-click', 'upload-file', 'forms', 'handle-download']);

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') KONF.out = argv[++i];
  else if (a === '--pomin') String(argv[++i]).split(',').forEach((x) => KONF.pomin.add(x.trim()));
  else if (a === '--proby') KONF.proby = Number(argv[++i]);
  else if (a === '--odstep') KONF.odstep = Number(argv[++i]);
  else if (a === '--opoznienie') KONF.opoznienie = Number(argv[++i]);
  else if (a === '--pobieranie') KONF.pobieranie = Number(argv[++i]);
  else if (a === '--dry-run') KONF.dryRun = true;
  else if (a === '-h' || a === '--help') { pomoc(); process.exit(0); }
  else if (a.startsWith('--')) { console.error('Nieznana opcja: ' + a); process.exit(1); }
  else KONF.wejscia.push(a);
}

function pomoc() {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
}

if (!KONF.wejscia.length) { pomoc(); process.exit(1); }

/* ====== pliki wejściowe ====== */
const pliki = [];
for (const wej of KONF.wejscia) {
  if (!fs.existsSync(wej)) { console.error('Nie ma takiej ścieżki: ' + wej); process.exit(1); }
  if (fs.statSync(wej).isDirectory()) {
    fs.readdirSync(wej).filter((f) => f.endsWith('.json')).sort()
      .forEach((f) => pliki.push(path.join(wej, f)));
  } else pliki.push(wej);
}

/* ====== poprawki ====== */

/* punkt 5 — rzadsze odpytywanie, ten sam (lub dłuższy) łączny czas czekania */
function poprawElementExists(node, stat) {
  const d = node.data || {};
  const staryOdstep = Number(d.timeout);
  const stareProby = Number(d.tryCount);
  if (!Number.isFinite(staryOdstep) || !Number.isFinite(stareProby)) return;
  if (staryOdstep >= EE_ODSTEP_MS) return; // już odpytuje spokojnie — nie ruszamy

  const stareLacznie = staryOdstep * stareProby;
  const lacznie = Math.min(Math.max(stareLacznie, EE_MIN_MS), EE_MAX_MS);
  d.timeout = EE_ODSTEP_MS;
  d.tryCount = Math.ceil(lacznie / EE_ODSTEP_MS);

  const opis = stareProby + '×' + staryOdstep + 'ms (' + Math.round(stareLacznie / 1000) + 's) → ' +
    d.tryCount + '×' + EE_ODSTEP_MS + 'ms (' + Math.round(lacznie / 1000) + 's)';
  stat[opis] = (stat[opis] || 0) + 1;
}

/* punkt 6 — ponawianie na blokach działających na stronie */
function poprawRetry(node, stat) {
  if (!BLOKI_DO_PONAWIANIA.has(node.label)) return;
  const d = node.data || (node.data = {});

  if (!d.onError) {
    /* blok nie ma obsługi błędu: błąd zatrzymuje workflow. Zachowujemy to
       zachowanie (toDo: 'error'), dokładając same próby ponowienia. */
    d.onError = {
      enable: true,
      retry: true,
      retryTimes: KONF.proby,
      retryInterval: KONF.odstep,
      toDo: 'error',
      errorMessage: '',
      insertData: false,
      dataToInsert: [],
    };
    stat['dodano obsługę błędu + ' + KONF.proby + ' prób (' + node.label + ', toDo: error)'] =
      (stat['dodano obsługę błędu + ' + KONF.proby + ' prób (' + node.label + ', toDo: error)'] || 0) + 1;
    return;
  }

  const oe = d.onError;
  if (oe.retry === true && Number(oe.retryTimes) >= KONF.proby) return; // już ponawia

  const przed = 'retry=' + oe.retry + ' times=' + oe.retryTimes;
  oe.enable = true;
  oe.retry = true;
  /* nie obniżamy tego, co ktoś ustawił świadomie wyżej */
  oe.retryTimes = Math.max(Number(oe.retryTimes) || 0, KONF.proby);
  oe.retryInterval = Math.max(Number(oe.retryInterval) || 0, KONF.odstep);

  const opis = node.label + ': ' + przed + ' → retry=true times=' + oe.retryTimes +
    ' interval=' + oe.retryInterval + 's (toDo: ' + oe.toDo + ' bez zmian)';
  stat[opis] = (stat[opis] || 0) + 1;
}

/* punkt 2 — realny limit czekania na pobrany plik */
function poprawDownload(node, stat) {
  const d = node.data || {};
  const stary = Number(d.timeout);
  if (!Number.isFinite(stary) || stary >= KONF.pobieranie) return;
  d.timeout = KONF.pobieranie;
  const opis = stary + 'ms → ' + KONF.pobieranie + 'ms';
  stat[opis] = (stat[opis] || 0) + 1;
}

/* punkt 8 — ustawienia workflow */
function poprawUstawienia(wf, stat) {
  const s = wf.settings;
  if (!s) return;
  if (s.execContext && s.execContext !== 'background') {
    stat['execContext: ' + s.execContext + ' → background'] =
      (stat['execContext: ' + s.execContext + ' → background'] || 0) + 1;
    s.execContext = 'background';
  }
  const stary = Number(s.blockDelay);
  if (Number.isFinite(stary) && stary < KONF.opoznienie) {
    stat['blockDelay: ' + stary + ' → ' + KONF.opoznienie + ' ms'] =
      (stat['blockDelay: ' + stary + ' → ' + KONF.opoznienie + ' ms'] || 0) + 1;
    s.blockDelay = KONF.opoznienie;
  }
}

/* jeden workflow: główny albo kopia z includedWorkflows */
function przetworzWorkflow(wf, stat) {
  if (!KONF.pomin.has('ustawienia')) poprawUstawienia(wf, stat.ustawienia);

  let df = wf.drawflow;
  const bylString = typeof df === 'string';
  if (bylString) { try { df = JSON.parse(df); } catch (_) { return; } }
  if (!df || !Array.isArray(df.nodes)) return;

  for (const node of df.nodes) {
    if (node.label === 'element-exists' && !KONF.pomin.has('element-exists')) {
      poprawElementExists(node, stat.elementExists);
    }
    if (node.label === 'handle-download' && !KONF.pomin.has('download')) {
      poprawDownload(node, stat.download);
    }
    if (!KONF.pomin.has('retry')) poprawRetry(node, stat.retry);
  }

  if (bylString) wf.drawflow = JSON.stringify(df);
}

/* ====== przetwarzanie ====== */
if (!KONF.dryRun) fs.mkdirSync(KONF.out, { recursive: true });

console.log('Poprawki: ' + ['element-exists', 'retry', 'ustawienia', 'download']
  .filter((x) => !KONF.pomin.has(x)).join(', ') + (KONF.dryRun ? '   [PRÓBA — bez zapisu]' : ''));

const suma = { elementExists: 0, retry: 0, ustawienia: 0, download: 0 };

for (const plik of pliki) {
  let dane;
  try { dane = JSON.parse(fs.readFileSync(plik, 'utf8')); }
  catch (err) { console.error('  POMINIĘTO ' + path.basename(plik) + ': ' + err.message); continue; }

  const stat = { elementExists: {}, retry: {}, ustawienia: {}, download: {} };

  przetworzWorkflow(dane, stat);
  for (const kopia of Object.values(dane.includedWorkflows || {})) przetworzWorkflow(kopia, stat);

  console.log('\n' + path.basename(plik) + '   [' + (dane.name || '?').trim() + ']');
  for (const [nazwa, etykieta] of [
    ['elementExists', 'Element exists'],
    ['retry', 'ponawianie'],
    ['download', 'Handle download'],
    ['ustawienia', 'ustawienia workflow'],
  ]) {
    const wpisy = Object.entries(stat[nazwa]).sort((a, b) => b[1] - a[1]);
    const ile = wpisy.reduce((s, [, v]) => s + v, 0);
    suma[nazwa] += ile;
    if (!ile) { console.log('  ' + etykieta + ': bez zmian'); continue; }
    console.log('  ' + etykieta + ': ' + ile);
    wpisy.forEach(([k, v]) => console.log('      ' + String(v).padStart(4) + '×  ' + k));
  }

  if (!KONF.dryRun) {
    const cel = path.join(KONF.out, path.basename(plik));
    fs.writeFileSync(cel, JSON.stringify(dane));
    console.log('  zapisano: ' + cel);
  }
}

console.log('\nRAZEM: Element exists ' + suma.elementExists + ', ponawianie ' + suma.retry +
  ', Handle download ' + suma.download + ', ustawienia ' + suma.ustawienia);
if (!KONF.dryRun) console.log('Poprawione pliki: ' + path.resolve(KONF.out));
