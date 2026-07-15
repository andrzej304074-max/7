/*
 * Blok JavaScript dla Automy — klika przycisk dnia w kalendarzu.
 *
 * Zasada działania (wg zegara KOMPUTERA, na którym działa przeglądarka):
 *  - od 00:00 do 13:29  → klika DZISIEJSZY przycisk:
 *      button[aria-label="Today, Wednesday, July 15th, 2026, selected"]
 *  - od 13:30 do 23:59  → klika JUTRZEJSZY przycisk:
 *      button[aria-label="Thursday, July 16th, 2026, selected"]
 *
 * Wymagania w Automie:
 *  - „Execution context" bloku: Active tab
 *  - timeout bloku: min. 20 s
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const GODZINA_GRANICZNA = 13;   // godzina graniczna (13:30)
  const MINUTA_GRANICZNA = 30;    // od 13:30 do północy → jutro; wcześniej → dzisiaj
  const WYMUS_TRYB = 'auto';      // 'auto' = wg zegara komputera; 'dzisiaj' / 'jutro' = wymuszenie do testów
  const MAKS_CZEKANIE_MS = 15000; // ile czekać na przycisk; 0 = bez limitu
  const INTERWAL_MS = 200;        // co ile ponawiać sprawdzanie
  /* ========================== */

  const bezLimitu = !(MAKS_CZEKANIE_MS > 0);

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    console.log('[click-next-day]', dane);
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
  };

  if (!bezLimitu) {
    setTimeout(() => {
      zakoncz({ ok: false, error: 'watchdog: skrypt nie zakończył się w limicie' });
    }, MAKS_CZEKANIE_MS + 2000);
  }

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({
        ok: false,
        error: 'Brak dostępu do strony — ustaw "Execution context" bloku na "Active tab".',
      });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ===== 1: data i godzina z zegara komputera ===== */
    const teraz = new Date();
    let poGranicy;
    if (WYMUS_TRYB === 'jutro') poGranicy = true;
    else if (WYMUS_TRYB === 'dzisiaj') poGranicy = false;
    else
      poGranicy =
        teraz.getHours() > GODZINA_GRANICZNA ||
        (teraz.getHours() === GODZINA_GRANICZNA && teraz.getMinutes() >= MINUTA_GRANICZNA);
    const tryb = poGranicy ? 'jutro' : 'dzisiaj';

    // diagnostyka: czas odczytany z komputera (to on decyduje o trybie)
    const diagnostyka = {
      czasKomputera: teraz.toString(),
      godzina:
        String(teraz.getHours()).padStart(2, '0') + ':' + String(teraz.getMinutes()).padStart(2, '0'),
      tryb,
      wersjaSkryptu: 4,
    };

    /* ===== 2: data docelowa i etykiety wg schematu strony ===== */
    const data = new Date(teraz);
    if (poGranicy) data.setDate(data.getDate() + 1);

    const dzien = data.getDate();
    const koncowka = (d) => {
      if (d % 100 >= 11 && d % 100 <= 13) return 'th';
      switch (d % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };
    const etykietaDaty =
      data.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' +
      data.toLocaleDateString('en-US', { month: 'long' }) + ' ' +
      dzien + koncowka(dzien) + ', ' + data.getFullYear();

    // dokładne etykiety, w kolejności prób: najpierw z „, selected",
    // potem bez — na wypadek, gdy strona dopisuje „selected" dopiero po zaznaczeniu
    const prefiks = poGranicy ? '' : 'Today, ';
    const kandydaci = [
      prefiks + etykietaDaty + ', selected',
      prefiks + etykietaDaty,
    ];
    diagnostyka.etykieta = kandydaci[0];

    /* ===== 3: czekaj, aż przycisk pojawi się na stronie ===== */
    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
      } catch (_) { return false; }
    };

    const klikalny = (el) =>
      el && widoczny(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';

    const znajdzPrzycisk = () => {
      for (let i = 0; i < kandydaci.length; i++) {
        let lista = [];
        try {
          lista = Array.prototype.slice.call(
            document.querySelectorAll('button[aria-label="' + kandydaci[i] + '"]')
          );
        } catch (_) { lista = []; }
        const el = lista.find(klikalny);
        if (el) return el;
      }
      return null;
    };

    const start = Date.now();
    let przycisk = znajdzPrzycisk();
    while (!przycisk) {
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) {}
      }
      await czekaj(INTERWAL_MS);
      przycisk = znajdzPrzycisk();
    }
    if (!przycisk) {
      // diagnostyka: pokaż, jakie etykiety z datami strona faktycznie ma
      const miesiac = data.toLocaleDateString('en-US', { month: 'long' });
      let przykladoweEtykiety = [];
      try {
        przykladoweEtykiety = Array.prototype.slice
          .call(document.querySelectorAll('button[aria-label]'))
          .map((el) => el.getAttribute('aria-label'))
          .filter((t) => t && (t.indexOf(miesiac) !== -1 || t.indexOf('Today') !== -1))
          .slice(0, 15);
      } catch (_) {}
      return zakoncz(Object.assign({}, diagnostyka, {
        ok: false,
        error: 'Nie znaleziono klikalnego przycisku o aria-label: „' + kandydaci.join('" ani „') + '".',
        przykladoweEtykiety,
      }));
    }

    /* ===== 4: kliknięcie pełną sekwencją zdarzeń ===== */
    try { przycisk.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    const r = przycisk.getBoundingClientRect();
    const props = {
      bubbles: true, cancelable: true, composed: true, view: window, button: 0,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    przycisk.dispatchEvent(new PointerEvent('pointerover', props));
    przycisk.dispatchEvent(new MouseEvent('mouseover', props));
    przycisk.dispatchEvent(new PointerEvent('pointerdown', props));
    przycisk.dispatchEvent(new MouseEvent('mousedown', props));
    przycisk.dispatchEvent(new PointerEvent('pointerup', props));
    przycisk.dispatchEvent(new MouseEvent('mouseup', props));
    przycisk.dispatchEvent(new MouseEvent('click', props));

    zakoncz(Object.assign({}, diagnostyka, {
      ok: true,
      kliknieto: przycisk.getAttribute('aria-label'),
      czekalemMs: Date.now() - start,
    }));
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
