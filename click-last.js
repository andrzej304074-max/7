/*
 * Blok JavaScript dla Automy — KLIKNIJ OSTATNI ELEMENT Z SELEKTORA.
 *
 * Logika: bierze WSZYSTKIE elementy pasujące do selektora
 * div.p-1:nth-child(2) (na stronie, w iframe'ach same-origin i w shadow DOM),
 * odfiltrowuje niewidoczne i klika OSTATNI z nich.
 *
 * 1. Czeka, aż lista dopasowań przestanie się doładowywać (stabilizacja),
 *    żeby "ostatni" był naprawdę ostatni.
 * 2. Jeśli w środku ostatniego bloku jest właściwy element klikalny
 *    (a / button / [role=button] / [onclick]) — celuje w niego.
 * 3. Klika pełną sekwencją zdarzeń (pointer + mouse) + natywnym click();
 *    jeśli w punkcie kliknięcia leży nakładka, klika też ją.
 * 4. Wynik pokazuje NA STRONIE (plakietka w rogu: zielona = kliknięte,
 *    czerwona = błąd) oraz zwraca przez automaNextBlock.
 *
 * Ustawienia bloku w Automie: Execution context = Active tab, timeout ≥ 20 s.
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR = 'div.p-1:nth-child(2)'; // bloki = wszystkie dopasowania tego selektora
  const STABILIZACJA_MS = 800;             // ile ms lista ma się nie zmieniać przed kliknięciem
  const MAKS_CZEKANIE_MS = 15000;          // maksymalny czas czekania; 0 = bez limitu
  const INTERWAL_MS = 250;
  const PLAKIETKA_MS = 10000;              // jak długo pokazywać wynik na stronie
  /* ========================== */

  const bezLimitu = !(MAKS_CZEKANIE_MS > 0);

  const pokaz = (tekst, kolor) => {
    try {
      let el = document.getElementById('automa-klik-wynik');
      if (!el) {
        el = document.createElement('div');
        el.id = 'automa-klik-wynik';
        el.style.cssText =
          'position:fixed;z-index:2147483647;top:12px;right:12px;max-width:440px;' +
          'padding:12px 16px;font:13px/1.5 monospace;color:#fff;border-radius:10px;' +
          'white-space:pre-wrap;word-break:break-word;box-shadow:0 4px 16px rgba(0,0,0,.45)';
        document.documentElement.appendChild(el);
      }
      el.style.background = kolor;
      el.textContent = tekst;
      setTimeout(() => { try { el.remove(); } catch (_) {} }, PLAKIETKA_MS);
    } catch (_) {}
  };

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    console.log('[click-last]', dane);
    if (dane.ok) pokaz('KLIKNIETO: ' + dane.klikniety + '\nblok: ' + dane.ktoryBlok, '#1a7f37');
    else pokaz('BLAD: ' + dane.error, '#b91c1c');
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
  };

  if (!bezLimitu) {
    setTimeout(() => zakoncz({ ok: false, error: 'watchdog: przekroczono limit czasu' }), MAKS_CZEKANIE_MS + 2000);
  }

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({ ok: false, error: 'Brak dostępu do strony — Execution context musi byc "Active tab".' });
    }
    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = (el.ownerDocument.defaultView || window).getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
      } catch (_) { return false; }
    };

    /* wszystkie dostępne dokumenty: strona + iframe'y (same-origin) */
    const dokumenty = () => {
      const docs = [document];
      const zbierz = (doc) => {
        let ramki = [];
        try { ramki = doc.querySelectorAll('iframe, frame'); } catch (_) {}
        for (let i = 0; i < ramki.length; i++) {
          try {
            const d = ramki[i].contentDocument;
            if (d && docs.indexOf(d) === -1) { docs.push(d); zbierz(d); }
          } catch (_) {}
        }
      };
      zbierz(document);
      return docs;
    };

    /* wszystkie dopasowania selektora, także w shadow DOM */
    const znajdzWszedzie = (sel) => {
      const wyniki = [];
      const szukaj = (root) => {
        try {
          const m = root.querySelectorAll(sel);
          for (let i = 0; i < m.length; i++) wyniki.push(m[i]);
        } catch (_) {}
        let all = [];
        try { all = root.querySelectorAll('*'); } catch (_) {}
        for (let i = 0; i < all.length; i++) {
          if (all[i].shadowRoot) szukaj(all[i].shadowRoot);
        }
      };
      const docs = dokumenty();
      for (let i = 0; i < docs.length; i++) szukaj(docs[i]);
      return wyniki;
    };

    const widoczneBloki = () => znajdzWszedzie(SELEKTOR).filter(widoczny);

    /* czekaj na bloki + stabilizacja listy (żeby "ostatni" był naprawdę ostatni) */
    const start = Date.now();
    let lista = widoczneBloki();
    let poprzednio = lista.length;
    let stabilnyOd = Date.now();
    while (true) {
      if (lista.length > 0 && Date.now() - stabilnyOd >= STABILIZACJA_MS) break;
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') { try { automaResetTimeout(); } catch (_) {} }
      await czekaj(INTERWAL_MS);
      lista = widoczneBloki();
      if (lista.length !== poprzednio) { poprzednio = lista.length; stabilnyOd = Date.now(); }
    }

    if (!lista.length) {
      return zakoncz({ ok: false, error: 'Nie znaleziono zadnego widocznego elementu: ' + SELEKTOR });
    }

    /* ostatni blok i właściwy element klikalny w jego środku */
    const blok = lista[lista.length - 1];
    let cel = blok;
    try {
      const wewn = blok.querySelector('a, button, [role="button"], [onclick]');
      if (wewn && widoczny(wewn)) cel = wewn;
    } catch (_) {}

    /* kliknięcie */
    try { cel.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    await czekaj(150);
    const doc = cel.ownerDocument || document;
    const win = doc.defaultView || window;
    const box = cel.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const props = { bubbles: true, cancelable: true, composed: true, view: win, button: 0, clientX: cx, clientY: cy };

    let naWierzchu = null;
    try { naWierzchu = doc.elementFromPoint(cx, cy); } catch (_) {}

    const klik = (el) => {
      try {
        el.dispatchEvent(new win.PointerEvent('pointerover', props));
        el.dispatchEvent(new win.MouseEvent('mouseover', props));
        el.dispatchEvent(new win.PointerEvent('pointerdown', props));
        el.dispatchEvent(new win.MouseEvent('mousedown', props));
        el.dispatchEvent(new win.PointerEvent('pointerup', props));
        el.dispatchEvent(new win.MouseEvent('mouseup', props));
        el.dispatchEvent(new win.MouseEvent('click', props));
      } catch (_) {}
      try { if (typeof el.click === 'function') el.click(); } catch (_) {}
    };

    klik(cel);
    if (naWierzchu && naWierzchu !== cel && !cel.contains(naWierzchu) && !naWierzchu.contains(cel)) {
      klik(naWierzchu);
    }

    zakoncz({
      ok: true,
      selektor: SELEKTOR,
      ktoryBlok: lista.length + ' z ' + lista.length + ' (ostatni)',
      klikniety: '<' + cel.tagName.toLowerCase() + '> ' + (cel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
