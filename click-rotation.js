/*
 * Blok JavaScript dla Automy — ROTACJA PRZYCISKÓW.
 *
 * Przy każdym uruchomieniu workflow klika DOKŁADNIE JEDEN przycisk
 * z listy PRZYCISKI — za każdym razem następny z kolei, a po ostatnim
 * wraca do pierwszego. Dzięki temu kliknięcia rozkładają się równomiernie.
 *
 * Numer kolejki jest zapamiętywany w localStorage strony, więc przetrwa
 * między osobnymi uruchomieniami workflow (ten sam komputer, ta sama
 * przeglądarka i ta sama strona; wyczyszczenie danych strony zeruje kolejkę).
 *
 * Wymagania w Automie:
 *  - „Execution context" bloku: Active tab
 *  - timeout bloku: min. 20 s
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const PRZYCISKI = [
    'button[aria-label="TU WKLEJ ARIA-LABEL PRZYCISKU 1"]',
    'button[aria-label="TU WKLEJ ARIA-LABEL PRZYCISKU 2"]',
    'button[aria-label="TU WKLEJ ARIA-LABEL PRZYCISKU 3"]',
  ];
  const KLUCZ_LICZNIKA = 'automa_rotacja_przyciskow'; // nazwa licznika w localStorage
  const PROBUJ_NASTEPNE = true;   // gdy przycisku z kolejki nie ma → kliknij kolejny dostępny z listy
  const MAKS_CZEKANIE_MS = 15000; // ile czekać na przycisk z kolejki; 0 = bez limitu
  const INTERWAL_MS = 200;        // co ile ponawiać sprawdzanie
  /* ========================== */

  const bezLimitu = !(MAKS_CZEKANIE_MS > 0);

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    console.log('[click-rotation]', dane);
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
    if (!PRZYCISKI.length) {
      return zakoncz({ ok: false, error: 'Lista PRZYCISKI jest pusta — wpisz selektory przycisków.' });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));
    const N = PRZYCISKI.length;

    /* ===== 1: odczytaj z localStorage, czyj teraz ruch ===== */
    const odczytajIndeks = () => {
      try {
        const v = parseInt(localStorage.getItem(KLUCZ_LICZNIKA), 10);
        return Number.isInteger(v) && v >= 0 ? v % N : 0;
      } catch (_) { return 0; }
    };
    const zapiszIndeks = (i) => {
      try { localStorage.setItem(KLUCZ_LICZNIKA, String(i % N)); } catch (_) {}
    };
    const indeksStartowy = odczytajIndeks();

    /* ===== 2: szukanie klikalnego przycisku ===== */
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
    const znajdz = (selektor) => {
      let lista = [];
      try {
        lista = Array.prototype.slice.call(document.querySelectorAll(selektor));
      } catch (_) { lista = []; }
      return lista.find(klikalny) || null;
    };

    /* ===== 3: czekaj na przycisk, którego jest teraz kolej ===== */
    const start = Date.now();
    let wybranyIndeks = indeksStartowy;
    let przycisk = znajdz(PRZYCISKI[wybranyIndeks]);
    while (!przycisk) {
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) {}
      }
      await czekaj(INTERWAL_MS);
      przycisk = znajdz(PRZYCISKI[wybranyIndeks]);
    }

    // przycisku z kolejki nie ma — opcjonalnie weź kolejny dostępny z listy
    if (!przycisk && PROBUJ_NASTEPNE) {
      for (let k = 1; k < N && !przycisk; k++) {
        const kandydat = (indeksStartowy + k) % N;
        const el = znajdz(PRZYCISKI[kandydat]);
        if (el) {
          przycisk = el;
          wybranyIndeks = kandydat;
        }
      }
    }

    if (!przycisk) {
      let przykladoweEtykiety = [];
      try {
        przykladoweEtykiety = Array.prototype.slice
          .call(document.querySelectorAll('button[aria-label]'))
          .filter(widoczny)
          .map((el) => el.getAttribute('aria-label'))
          .slice(0, 15);
      } catch (_) {}
      return zakoncz({
        ok: false,
        error: 'Żaden przycisk z listy nie jest dostępny na stronie.',
        kolejByla: indeksStartowy + 1,
        selektorZKolejki: PRZYCISKI[indeksStartowy],
        przykladoweEtykiety,
      });
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

    /* ===== 5: zapisz, że następnym razem ma być kolejny przycisk ===== */
    zapiszIndeks(wybranyIndeks + 1);

    zakoncz({
      ok: true,
      klikniety: (wybranyIndeks + 1) + ' z ' + N,
      selektor: PRZYCISKI[wybranyIndeks],
      kliknieto: przycisk.getAttribute('aria-label'),
      nastepnyBedzie: ((wybranyIndeks + 1) % N) + 1,
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
