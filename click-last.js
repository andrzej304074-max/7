/*
 * Blok JavaScript dla Automy — KLIKNIJ OSTATNIĄ POZYCJĘ LISTY ROZWIJANEJ.
 *
 * Przeznaczone dla dropdownów z wyszukiwaniem. Kolejność szukania pozycji:
 *  1. prawdziwe opcje listy: [role="option"] (tak zbudowana jest większość
 *     list rozwijanych z wyszukiwarką),
 *  2. zapasowo: widoczne bloki w kontenerze KONTENER (dzieci), z pominięciem
 *     elementów <button> — żeby nie klikać stopek typu „pokaż więcej".
 *
 * Klika OSTATNIĄ znalezioną pozycję — bezpośrednio w wiersz (bez wchodzenia
 * w przyciski w środku), pełną sekwencją pointer/mouse + click().
 * Czeka, aż lista przestanie się zmieniać (wyniki wyszukiwania się ustalą).
 *
 * Wynik pokazuje plakietką na stronie (zielona = OK, czerwona = błąd)
 * i zwraca przez automaNextBlock.
 *
 * Ustawienia bloku w Automie: Execution context = Active tab, timeout ≥ 20 s.
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const KONTENER = 'div.p-1:nth-child(2)'; // zapasowy kontener, gdy brak [role=option]
  const SELEKTOR_ZAPASOWY = 'div.p-1';
  const STABILIZACJA_MS = 800;             // ile ms lista ma się nie zmieniać przed kliknięciem
  const MAKS_CZEKANIE_MS = 15000;          // maksymalny czas czekania; 0 = bez limitu
  const INTERWAL_MS = 250;
  const PLAKIETKA_MS = 10000;
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
    if (dane.ok) pokaz('KLIKNIETO: ' + dane.klikniety + '\nzrodlo: ' + dane.zrodlo + '\npozycja: ' + dane.pozycja, '#1a7f37');
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

    /* wszystkie dokumenty: strona + iframe'y (same-origin) */
    const dokumenty = () => {
      const docs = [document];
      const zbierzRamki = (doc) => {
        let ramki = [];
        try { ramki = doc.querySelectorAll('iframe, frame'); } catch (_) {}
        for (let i = 0; i < ramki.length; i++) {
          try {
            const d = ramki[i].contentDocument;
            if (d && docs.indexOf(d) === -1) { docs.push(d); zbierzRamki(d); }
          } catch (_) {}
        }
      };
      zbierzRamki(document);
      return docs;
    };

    /* dopasowania selektora także w shadow DOM */
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

    /* pozycje listy: najpierw role=option, potem bloki kontenera bez <button> */
    const zbierzPozycje = () => {
      let opcje = znajdzWszedzie('[role="option"]').filter(widoczny);
      if (opcje.length) return { zrodlo: '[role=option]', lista: opcje };

      let kandydaci = znajdzWszedzie(KONTENER);
      let zrodlo = KONTENER;
      if (!kandydaci.length && SELEKTOR_ZAPASOWY) {
        kandydaci = znajdzWszedzie(SELEKTOR_ZAPASOWY);
        zrodlo = SELEKTOR_ZAPASOWY + ' (zapasowy)';
      }
      let najlepszy = null, najwiecej = -1;
      for (let i = 0; i < kandydaci.length; i++) {
        const n = Array.prototype.slice.call(kandydaci[i].children).filter(widoczny).length;
        if (n > najwiecej) { najwiecej = n; najlepszy = kandydaci[i]; }
      }
      if (!najlepszy) return { zrodlo, lista: [] };
      const lista = Array.prototype.slice.call(najlepszy.children)
        .filter(widoczny)
        .filter((el) => el.tagName !== 'BUTTON' && !(el.children.length === 1 && el.children[0].tagName === 'BUTTON'));
      return { zrodlo, lista };
    };

    /* czekaj aż pozycje są i lista przestanie się zmieniać */
    const start = Date.now();
    let st = zbierzPozycje();
    let poprzednio = st.lista.length;
    let stabilnyOd = Date.now();
    while (true) {
      if (st.lista.length > 0 && Date.now() - stabilnyOd >= STABILIZACJA_MS) break;
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') { try { automaResetTimeout(); } catch (_) {} }
      await czekaj(INTERWAL_MS);
      st = zbierzPozycje();
      if (st.lista.length !== poprzednio) { poprzednio = st.lista.length; stabilnyOd = Date.now(); }
    }

    if (!st.lista.length) {
      return zakoncz({
        ok: false,
        error: 'Nie znaleziono pozycji listy — ani [role=option], ani bloków w: ' + KONTENER +
          '. Upewnij sie, ze lista rozwijana jest OTWARTA, zanim ten blok sie uruchomi.',
      });
    }

    /* OSTATNIA pozycja — klikamy w sam wiersz */
    const wiersz = st.lista[st.lista.length - 1];
    try { wiersz.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    await czekaj(150);

    const doc = wiersz.ownerDocument || document;
    const win = doc.defaultView || window;
    const box = wiersz.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;

    /* celuj w najgłębszy element w środku wiersza (jak prawdziwy kursor);
       zdarzenia i tak bąbelkują do wiersza i listy */
    let cel = wiersz;
    try {
      const p = doc.elementFromPoint(cx, cy);
      if (p && wiersz.contains(p)) cel = p;
    } catch (_) {}

    const props = { bubbles: true, cancelable: true, composed: true, view: win, button: 0, clientX: cx, clientY: cy };
    try {
      cel.dispatchEvent(new win.PointerEvent('pointerover', props));
      cel.dispatchEvent(new win.MouseEvent('mouseover', props));
      cel.dispatchEvent(new win.MouseEvent('mousemove', props));
      cel.dispatchEvent(new win.PointerEvent('pointerdown', props));
      cel.dispatchEvent(new win.MouseEvent('mousedown', props));
      cel.dispatchEvent(new win.PointerEvent('pointerup', props));
      cel.dispatchEvent(new win.MouseEvent('mouseup', props));
      cel.dispatchEvent(new win.MouseEvent('click', props));
    } catch (_) {}
    try { if (wiersz !== cel && typeof wiersz.click === 'function') wiersz.click(); } catch (_) {}

    zakoncz({
      ok: true,
      zrodlo: st.zrodlo,
      pozycja: st.lista.length + ' z ' + st.lista.length + ' (ostatnia)',
      klikniety: (wiersz.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || '<' + wiersz.tagName.toLowerCase() + '>',
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
