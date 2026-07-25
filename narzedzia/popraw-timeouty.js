#!/usr/bin/env node
/*
 * Hurtowa zmiana limitu „Wait for selector" w eksportach Automy.
 *
 * Punkt 3 z ANALIZA-PETLI.md: w blokach klikających, wgrywających
 * i wypełniających formularze limit czekania na element wynosi 5 000 ms.
 * Na obciążonej przeglądarce to za mało — ten sam blok raz przechodzi,
 * raz nie. Skrypt podnosi każdy limit poniżej zadanego progu.
 *
 * Zmienia WYŁĄCZNIE pola `waitSelectorTimeout`. Niczego innego nie rusza —
 * ani selektorów, ani połączeń, ani ustawień workflow.
 *
 * Obejmuje też kopie workflow zaszyte w `includedWorkflows` (eksport Automy
 * pakuje w środku pełne kopie workflow wołanych przez `Execute workflow`),
 * bo inaczej po imporcie wróciłyby stare limity.
 *
 * Użycie:
 *   node narzedzia/popraw-timeouty.js <plik.json|katalog> [...] [opcje]
 *
 * Opcje:
 *   --out <katalog>   gdzie zapisać poprawione pliki (domyślnie: ./poprawione)
 *   --limit <ms>      docelowy limit w ms (domyślnie: 20000)
 *   --dry-run         tylko pokaż, co by się zmieniło; nie zapisuj plików
 *
 * Przykład:
 *   node narzedzia/popraw-timeouty.js ~/Downloads/eksporty --out ~/Downloads/poprawione
 */

const fs = require('fs');
const path = require('path');

/* ====== parsowanie argumentów ====== */
const argv = process.argv.slice(2);
const opcje = { out: 'poprawione', limit: 20000, dryRun: false, wejscia: [] };

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') opcje.out = argv[++i];
  else if (a === '--limit') opcje.limit = Number(argv[++i]);
  else if (a === '--dry-run') opcje.dryRun = true;
  else if (a === '-h' || a === '--help') { pokazPomoc(); process.exit(0); }
  else if (a.startsWith('--')) { console.error('Nieznana opcja: ' + a); process.exit(1); }
  else opcje.wejscia.push(a);
}

function pokazPomoc() {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
}

if (!opcje.wejscia.length) { pokazPomoc(); process.exit(1); }
if (!Number.isFinite(opcje.limit) || opcje.limit <= 0) {
  console.error('--limit musi być liczbą dodatnią (ms)');
  process.exit(1);
}

/* ====== zbieranie plików wejściowych ====== */
const pliki = [];
for (const wej of opcje.wejscia) {
  if (!fs.existsSync(wej)) { console.error('Nie ma takiej ścieżki: ' + wej); process.exit(1); }
  if (fs.statSync(wej).isDirectory()) {
    fs.readdirSync(wej)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .forEach((f) => pliki.push(path.join(wej, f)));
  } else {
    pliki.push(wej);
  }
}
if (!pliki.length) { console.error('Nie znaleziono żadnego pliku .json'); process.exit(1); }

/*
 * Przejście po całej strukturze. `waitSelectorTimeout` siedzi w `data` bloków,
 * ale bloki leżą w kilku miejscach (drawflow.nodes, includedWorkflows[*].drawflow.nodes),
 * a `drawflow` bywa zapisany jako obiekt albo jako string z JSON-em.
 * Zamiast zgadywać ścieżki — schodzimy rekurencyjnie po wszystkim.
 */
function przejdz(wezel, licznik) {
  if (Array.isArray(wezel)) {
    for (const el of wezel) przejdz(el, licznik);
    return wezel;
  }
  if (!wezel || typeof wezel !== 'object') return wezel;

  for (const klucz of Object.keys(wezel)) {
    const wartosc = wezel[klucz];

    /* drawflow zapisany jako string z JSON-em w środku */
    if (klucz === 'drawflow' && typeof wartosc === 'string') {
      try {
        const rozpakowany = JSON.parse(wartosc);
        przejdz(rozpakowany, licznik);
        wezel[klucz] = JSON.stringify(rozpakowany);
      } catch (_) { /* nie JSON — zostawiamy jak było */ }
      continue;
    }

    if (klucz === 'waitSelectorTimeout') {
      const stara = Number(wartosc);
      if (Number.isFinite(stara) && stara < opcje.limit) {
        licznik[stara] = (licznik[stara] || 0) + 1;
        wezel[klucz] = opcje.limit;
      } else {
        licznik['bez zmian (>= ' + opcje.limit + ')'] =
          (licznik['bez zmian (>= ' + opcje.limit + ')'] || 0) + 1;
      }
      continue;
    }

    przejdz(wartosc, licznik);
  }
  return wezel;
}

/* ====== przetwarzanie ====== */
if (!opcje.dryRun) fs.mkdirSync(opcje.out, { recursive: true });

let lacznieZmienionych = 0;
console.log('Docelowy limit: ' + opcje.limit + ' ms' + (opcje.dryRun ? '   [PRÓBA — bez zapisu]' : ''));

for (const plik of pliki) {
  let dane;
  try {
    dane = JSON.parse(fs.readFileSync(plik, 'utf8'));
  } catch (err) {
    console.error('  POMINIĘTO ' + path.basename(plik) + ' — nie da się sparsować: ' + err.message);
    continue;
  }

  const licznik = {};
  przejdz(dane, licznik);

  const zmienione = Object.entries(licznik)
    .filter(([k]) => /^\d+$/.test(k))
    .reduce((suma, [, ile]) => suma + ile, 0);
  lacznieZmienionych += zmienione;

  const rozpiska = Object.entries(licznik)
    .map(([k, ile]) => (/^\d+$/.test(k) ? ile + '× ' + k + ' → ' + opcje.limit : ile + '× ' + k))
    .join(', ');

  console.log('\n' + path.basename(plik));
  console.log('  workflow: ' + (dane.name || '?').trim());
  console.log('  ' + (rozpiska || 'brak pól waitSelectorTimeout'));

  if (!opcje.dryRun) {
    const cel = path.join(opcje.out, path.basename(plik));
    fs.writeFileSync(cel, JSON.stringify(dane));
    console.log('  zapisano: ' + cel);
  }
}

console.log('\nRazem podniesionych limitów: ' + lacznieZmienionych);
if (!opcje.dryRun) {
  console.log('Poprawione pliki: ' + path.resolve(opcje.out));
  console.log('\nPo imporcie do Automy sprawdź bloki „Execute workflow" —');
  console.log('import może nadać workflow nowe identyfikatory i rozspójnić powiązania.');
}
