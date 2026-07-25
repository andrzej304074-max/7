#!/usr/bin/env node
/*
 * Audyt eksportów Automy — sprawdza, czy poprawki z ANALIZA-PETLI.md
 * faktycznie siedzą w plikach, i wypisuje, co jeszcze zostało do zrobienia.
 *
 * Sprawdza w każdym workflow (razem z kopiami w `includedWorkflows`):
 *   - execContext = background, blockDelay >= 300 ms          (punkt 8)
 *   - waitSelectorTimeout >= 20 000 ms                        (punkt 3)
 *   - Element exists: odstęp >= 500 ms                        (punkt 5)
 *   - Handle download: timeout >= 30 000 ms                   (punkt 2)
 *   - ponawianie włączone na blokach działających na stronie  (punkt 6)
 *   - spójność grafu: każda krawędź prowadzi do istniejącego bloku
 *
 * Osobno wypisuje rzeczy, których żaden skrypt nie ruszał, a które warto
 * mieć na oku: względne `Switch tab`, sztywne ścieżki plików, gałęzie
 * `fallback` donikąd, bloki bez żadnego wejścia.
 *
 * Użycie:
 *   node narzedzia/audyt.js <katalog-z-plikami|plik.json> [...]
 *
 * Kod wyjścia: 0 gdy brak błędów krytycznych, 1 gdy coś nie gra.
 */

const fs = require('fs');
const path = require('path');

/* progi — takie same jak w skryptach poprawiających */
const PROG = {
  waitSelector: 20000,
  elementExistsOdstep: 500,
  download: 30000,
  proby: 3,
  blockDelay: 300,
};
const BLOKI_Z_PONAWIANIEM = new Set(['event-click', 'upload-file', 'forms', 'handle-download']);

const wejscia = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!wejscia.length) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(1);
}

const pliki = [];
for (const wej of wejscia) {
  if (!fs.existsSync(wej)) { console.error('Nie ma takiej ścieżki: ' + wej); process.exit(1); }
  if (fs.statSync(wej).isDirectory()) {
    fs.readdirSync(wej).filter((f) => f.endsWith('.json')).sort()
      .forEach((f) => pliki.push(path.join(wej, f)));
  } else pliki.push(wej);
}

const workflowy = (d) =>
  [['GŁÓWNY', d]].concat(
    Object.entries(d.includedWorkflows || {}).map(([id, w]) => ['kopia: ' + ((w.name || id) + '').trim(), w])
  );

const graf = (w) => {
  let g = w.drawflow;
  if (typeof g === 'string') { try { g = JSON.parse(g); } catch (_) { g = null; } }
  return g && Array.isArray(g.nodes) ? g : { nodes: [], edges: [] };
};

const bledy = [];
const ostrzezenia = {};
const info = {};
const licz = (o, k) => { o[k] = (o[k] || 0) + 1; };

let ileWorkflow = 0;

for (const plik of pliki) {
  const nazwaPliku = path.basename(plik);
  let dane;
  try { dane = JSON.parse(fs.readFileSync(plik, 'utf8')); }
  catch (err) { bledy.push(nazwaPliku + ': niepoprawny JSON — ' + err.message); continue; }

  for (const [gdzie, wf] of workflowy(dane)) {
    ileWorkflow++;
    const gdzieOpis = nazwaPliku + ' / ' + gdzie;
    const s = wf.settings || {};

    if (s.execContext !== 'background') bledy.push(gdzieOpis + ': execContext=' + s.execContext);
    if (Number(s.blockDelay) < PROG.blockDelay) bledy.push(gdzieOpis + ': blockDelay=' + s.blockDelay);
    licz(info, 'settings.onError=' + s.onError + '  restartTimes=' + s.restartTimes + '  saveLog=' + s.saveLog);

    const g = graf(wf);
    const idy = new Set(g.nodes.map((n) => n.id));
    const zFallbackiem = new Set(g.edges.filter((e) => /fallback/.test(e.sourceHandle || '')).map((e) => e.source));
    const zWejsciem = new Set(g.edges.map((e) => e.target));

    for (const e of g.edges) {
      if (!idy.has(e.source) || !idy.has(e.target)) {
        bledy.push(gdzieOpis + ': krawędź prowadzi do nieistniejącego bloku (' + e.source + ' → ' + e.target + ')');
      }
    }

    for (const n of g.nodes) {
      const d = n.data || {};

      if (d.waitSelectorTimeout !== undefined && Number(d.waitSelectorTimeout) < PROG.waitSelector) {
        bledy.push(gdzieOpis + ': ' + n.label + ' waitSelectorTimeout=' + d.waitSelectorTimeout);
      }
      if (n.label === 'element-exists' && Number(d.timeout) < PROG.elementExistsOdstep) {
        bledy.push(gdzieOpis + ': element-exists odpytuje co ' + d.timeout + ' ms');
      }
      if (n.label === 'handle-download' && Number(d.timeout) < PROG.download) {
        bledy.push(gdzieOpis + ': handle-download timeout=' + d.timeout);
      }
      if (BLOKI_Z_PONAWIANIEM.has(n.label)) {
        const oe = d.onError;
        if (!oe || oe.retry !== true) bledy.push(gdzieOpis + ': ' + n.label + ' bez ponawiania');
        else if (Number(oe.retryTimes) < PROG.proby) bledy.push(gdzieOpis + ': ' + n.label + ' retryTimes=' + oe.retryTimes);
      }

      /* rzeczy nieobjęte poprawkami — tylko do wiadomości */
      if (d.onError && d.onError.toDo === 'fallback' && !zFallbackiem.has(n.id)) {
        licz(ostrzezenia, 'toDo=fallback, ale gałąź fallback nigdzie nie prowadzi (' + n.label + ')');
      }
      if (d.onError && d.onError.toDo === 'error') {
        licz(ostrzezenia, 'toDo=error — po wyczerpaniu prób workflow się zatrzyma (' + n.label + ')');
      }
      if (n.label === 'switch-tab' && /prev-tab|next-tab/.test(d.findTabBy || '')) {
        licz(ostrzezenia, 'switch-tab po pozycji, nie po URL (' + d.findTabBy + ')');
      }
      if (n.label === 'upload-file' && JSON.stringify(d.filePaths || []).includes('/Users/')) {
        licz(ostrzezenia, 'upload-file ze sztywną ścieżką do pliku');
      }
      if (n.label !== 'trigger' && !zWejsciem.has(n.id)) {
        licz(ostrzezenia, 'blok bez żadnego wejścia — nigdy się nie wykona (' + n.label + ')');
      }
    }
  }
}

console.log('Plików: ' + pliki.length + '   workflow (razem z kopiami): ' + ileWorkflow);

console.log('\n=== BŁĘDY KRYTYCZNE ===');
if (!bledy.length) console.log('  brak');
else {
  bledy.slice(0, 40).forEach((b) => console.log('  ' + b));
  if (bledy.length > 40) console.log('  … oraz ' + (bledy.length - 40) + ' więcej');
}

console.log('\n=== USTAWIENIA WORKFLOW ===');
Object.entries(info).forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '×  ' + k));

console.log('\n=== NIEOBJĘTE POPRAWKAMI (do decyzji) ===');
const w = Object.entries(ostrzezenia).sort((a, b) => b[1] - a[1]);
if (!w.length) console.log('  brak');
else w.forEach(([k, v]) => console.log('  ' + String(v).padStart(5) + '×  ' + k));

console.log('\nLiczby obejmują kopie workflow z includedWorkflows,');
console.log('więc ten sam blok bywa policzony kilka razy.');

process.exit(bledy.length ? 1 : 0);
