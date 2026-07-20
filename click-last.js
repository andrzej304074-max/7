/*
 * Blok JavaScript dla Automy — KLIKNIJ OSTATNI BLOK W KONTENERZE.
 *
 * Bierze ostatnie (widoczne) dziecko kontenera KONTENER i klika je.
 * Jeśli w środku bloku jest właściwy klikalny element (a / button /
 * [role=button] / [onclick]), klika ten element. Bloki mogą mieć różny
 * format — skrypt nie zakłada nic o ich wyglądzie.
 *
 * Wymagania w Automie:
 *  - „Execution context" bloku: Active tab
 *  - timeout bloku: min. 20 s
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const KONTENER = 'div.p-1:nth-child(2)'; // selektor kontenera z blokami
  const STABILIZACJA_MS = 800;    // ile ms liczba bloków ma się nie zmieniać, zanim klikniemy
  const MAKS_CZEKANIE_MS = 15000; // maksymalny czas czekania; 0 = bez limitu
  const INTERWAL_MS = 200;
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
    setTimeout(() => zakoncz({ ok: false, error: 'watchdog: przekroczono limit' }), MAKS_CZEKANIE_MS + 2000);
  }

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({ ok: false, error: 'Brak dostępu do strony — ustaw Execution context na "Active tab".' });
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

    const dzieci = () => {
      let k = null;
      try { k = document.querySelector(KONTENER); } catch (_) {}
      if (!k) return { kontener: null, lista: [] };
      const lista = Array.prototype.slice.call(k.children).filter(widoczny);
      return { kontener: k, lista };
    };

    /* 1: czekaj aż kontener ma bloki i lista przestanie rosnąć */
    const start = Date.now();
    let st = dzieci();
    let ostatniaLiczba = st.lista.length;
    let stabilnyOd = Date.now();
    while (true) {
      if (st.lista.length > 0 && Date.now() - stabilnyOd >= STABILIZACJA_MS) break;
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') { try { automaResetTimeout(); } catch (_) {} }
      await czekaj(INTERWAL_MS);
      st = dzieci();
      if (st.lista.length !== ostatniaLiczba) { ostatniaLiczba = st.lista.length; stabilnyOd = Date.now(); }
    }

    if (!st.kontener) return zakoncz({ ok: false, error: 'Nie znaleziono kontenera: ' + KONTENER });
    if (!st.lista.length) return zakoncz({ ok: false, error: 'Kontener nie ma widocznych bloków.' });

    /* 2: ostatni blok + znalezienie w nim właściwego klikalnego elementu */
    const blok = st.lista[st.lista.length - 1];
    let cel = blok;
    try {
      const wewn = blok.querySelector('a, button, [role="button"], [onclick]');
      if (wewn && widoczny(wewn)) cel = wewn;
    } catch (_) {}

    /* 3: kliknięcie — pełna sekwencja zdarzeń + natywny click + trafienie w punkt */
    try { cel.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    await czekaj(150);
    const r = cel.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const props = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: cx, clientY: cy };

    // element faktycznie na wierzchu w tym punkcie (np. nakładka przechwytująca klik)
    let naWierzchu = cel;
    try { naWierzchu = document.elementFromPoint(cx, cy) || cel; } catch (_) {}

    const klik = (el) => {
      try {
        el.dispatchEvent(new PointerEvent('pointerover', props));
        el.dispatchEvent(new MouseEvent('mouseover', props));
        el.dispatchEvent(new PointerEvent('pointerdown', props));
        el.dispatchEvent(new MouseEvent('mousedown', props));
        el.dispatchEvent(new PointerEvent('pointerup', props));
        el.dispatchEvent(new MouseEvent('mouseup', props));
        el.dispatchEvent(new MouseEvent('click', props));
      } catch (_) {}
      try { if (typeof el.click === 'function') el.click(); } catch (_) {}
    };

    klik(cel);
    if (naWierzchu && naWierzchu !== cel && cel.contains(naWierzchu) === false) klik(naWierzchu);

    zakoncz({
      ok: true,
      ktoryBlok: st.lista.length + ' z ' + st.lista.length + ' (ostatni)',
      klikniety: '<' + cel.tagName.toLowerCase() + '> ' + (cel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      naWierzchuByl: '<' + (naWierzchu ? naWierzchu.tagName.toLowerCase() : '?') + '>',
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
