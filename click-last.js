/*
 * Blok JavaScript dla Automy — KLIKNIJ OSTATNI BLOK W KONTENERZE.
 *
 * Znajduje kontener (KONTENER), zbiera bloki znajdujące się w jego środku
 * (ELEMENTY), czeka aż lista przestanie się doładowywać i klika OSTATNI
 * widoczny blok z tej listy.
 *
 * Wymagania w Automie:
 *  - „Execution context" bloku: Active tab
 *  - timeout bloku: min. 20 s
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const KONTENER = 'div.p-1:nth-child(2)'; // selektor bloku-kontenera
  const ELEMENTY = ':scope > *';           // co liczyć jako bloki w środku: dzieci kontenera
                                           // (można zawęzić, np. ':scope > div' albo 'button')
  const STABILIZACJA_MS = 800;    // ile ms liczba bloków ma się nie zmieniać, zanim klikniemy ostatni
  const MAKS_CZEKANIE_MS = 15000; // maksymalny łączny czas czekania; 0 = bez limitu
  const INTERWAL_MS = 200;        // co ile ponawiać sprawdzanie
  /* ========================== */

  const bezLimitu = !(MAKS_CZEKANIE_MS > 0);

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    console.log('[click-last]', dane);
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

    const zbierz = () => {
      let kontener = null;
      try { kontener = document.querySelector(KONTENER); } catch (_) {}
      if (!kontener) return { kontener: null, bloki: [] };
      let bloki = [];
      try {
        bloki = Array.prototype.slice.call(kontener.querySelectorAll(ELEMENTY));
      } catch (_) { bloki = []; }
      return { kontener, bloki: bloki.filter(klikalny) };
    };

    /* ===== 1: czekaj na kontener i bloki; kliknij dopiero, gdy lista
       przestanie rosnąć (żeby „ostatni" był naprawdę ostatni) ===== */
    const start = Date.now();
    let stan = zbierz();
    let poprzedniaLiczba = stan.bloki.length;
    let stabilnyOd = Date.now();
    while (true) {
      if (stan.bloki.length > 0 && Date.now() - stabilnyOd >= STABILIZACJA_MS) break;
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) {}
      }
      await czekaj(INTERWAL_MS);
      stan = zbierz();
      if (stan.bloki.length !== poprzedniaLiczba) {
        poprzedniaLiczba = stan.bloki.length;
        stabilnyOd = Date.now();
      }
    }

    if (!stan.kontener) {
      return zakoncz({
        ok: false,
        error: 'Nie znaleziono kontenera pasującego do: ' + KONTENER,
      });
    }
    if (!stan.bloki.length) {
      return zakoncz({
        ok: false,
        error: 'Kontener istnieje, ale nie ma w nim żadnego widocznego bloku (' + ELEMENTY + ').',
      });
    }

    /* ===== 2: kliknij ostatni blok pełną sekwencją zdarzeń ===== */
    const przycisk = stan.bloki[stan.bloki.length - 1];
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

    zakoncz({
      ok: true,
      klikniety: stan.bloki.length + ' z ' + stan.bloki.length + ' (ostatni)',
      kliknieto:
        przycisk.getAttribute('aria-label') ||
        (przycisk.textContent || '').trim().slice(0, 80) ||
        '<' + przycisk.tagName.toLowerCase() + '>',
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
