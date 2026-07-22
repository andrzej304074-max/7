/*
 * Blok JavaScript dla Automy — KLIKNIJ OSTATNI BLOK W KONTENERZE (wersja finalna).
 *
 * 1. Szuka kontenera KONTENER — na stronie, w iframe'ach (same-origin)
 *    i w shadow DOM. Gdy dokładny selektor nic nie łapie, próbuje
 *    SELEKTOR_ZAPASOWY i wybiera kontener z największą liczbą bloków.
 * 2. Czeka, aż lista bloków w środku przestanie się doładowywać.
 * 3. Bierze OSTATNI widoczny blok; jeśli w środku jest właściwy element
 *    klikalny (a / button / [role=button] / [onclick]) — celuje w niego.
 * 4. Klika pełną sekwencją zdarzeń + natywnym click(); jeśli w punkcie
 *    kliknięcia leży nakładka, klika też ją.
 * 5. Wynik pokazuje NA STRONIE (plakietka w rogu: zielona = kliknięte,
 *    czerwona = błąd) oraz zwraca przez automaNextBlock.
 *
 * Ustawienia bloku w Automie: Execution context = Active tab, timeout ≥ 20 s.
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const KONTENER = 'div.p-1:nth-child(2)'; // główny selektor kontenera
  const SELEKTOR_ZAPASOWY = 'div.p-1';     // gdy główny nic nie złapie
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

    /* wybierz kontener: główny selektor, a w razie czego zapasowy
       (bierzemy ten z największą liczbą widocznych bloków) */
    const wybierzKontener = () => {
      let uzytySelektor = KONTENER;
      let kandydaci = znajdzWszedzie(KONTENER);
      if (!kandydaci.length && SELEKTOR_ZAPASOWY) {
        uzytySelektor = SELEKTOR_ZAPASOWY + ' (zapasowy)';
        kandydaci = znajdzWszedzie(SELEKTOR_ZAPASOWY);
      }
      let najlepszy = null, najwiecej = -1;
      for (let i = 0; i < kandydaci.length; i++) {
        const n = Array.prototype.slice.call(kandydaci[i].children).filter(widoczny).length;
        if (n > najwiecej) { najwiecej = n; najlepszy = kandydaci[i]; }
      }
      return { kontener: najlepszy, uzytySelektor };
    };

    const stanBlokow = () => {
      const w = wybierzKontener();
      if (!w.kontener) return { kontener: null, lista: [], uzytySelektor: w.uzytySelektor };
      const lista = Array.prototype.slice.call(w.kontener.children).filter(widoczny);
      return { kontener: w.kontener, lista, uzytySelektor: w.uzytySelektor };
    };

    /* czekaj na bloki + stabilizacja listy (żeby "ostatni" był naprawdę ostatni) */
    const start = Date.now();
    let st = stanBlokow();
    let poprzednio = st.lista.length;
    let stabilnyOd = Date.now();
    while (true) {
      if (st.lista.length > 0 && Date.now() - stabilnyOd >= STABILIZACJA_MS) break;
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') { try { automaResetTimeout(); } catch (_) {} }
      await czekaj(INTERWAL_MS);
      st = stanBlokow();
      if (st.lista.length !== poprzednio) { poprzednio = st.lista.length; stabilnyOd = Date.now(); }
    }

    if (!st.kontener) {
      return zakoncz({ ok: false, error: 'Nie znaleziono kontenera: ' + KONTENER + ' (ani zapasowego: ' + SELEKTOR_ZAPASOWY + ')' });
    }
    if (!st.lista.length) {
      return zakoncz({ ok: false, error: 'Kontener znaleziony (' + st.uzytySelektor + '), ale nie ma w nim widocznych bloków.' });
    }

    /* ostatni blok i właściwy element klikalny w jego środku */
    const blok = st.lista[st.lista.length - 1];
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
      uzytySelektor: st.uzytySelektor,
      ktoryBlok: st.lista.length + ' z ' + st.lista.length + ' (ostatni)',
      klikniety: '<' + cel.tagName.toLowerCase() + '> ' + (cel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
