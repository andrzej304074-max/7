/*
 * Blok JavaScript dla Automy — KLIKNIJ OSTATNIĄ KATEGORIĘ W DRZEWKU
 * (app.controlresell.com — lista rozwijana kategorii z wyszukiwaniem).
 *
 * Struktura strony: kontener div.overflow-y-auto.p-1, w nim wiersze
 * div.cursor-pointer. Wiersze rozwijalne mają jako pierwsze dziecko
 * <button> ze strzałką; wiersze KOŃCOWE (do wybrania, np. "Dresy")
 * strzałki nie mają. Skrypt klika OSTATNI wiersz końcowy — w sam wiersz,
 * nigdy w strzałkę.
 *
 * Wynik pokazuje plakietką na stronie (zielona = OK, czerwona = błąd)
 * i zwraca przez automaNextBlock.
 *
 * Ustawienia bloku w Automie: Execution context = Active tab, timeout ≥ 20 s.
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const KONTENER = 'div.overflow-y-auto.p-1, div.p-1'; // kontener listy
  const WIERSZ = '.cursor-pointer';                    // wiersze drzewka
  const TYLKO_KONCOWE = true;    // true = klikaj tylko wiersze bez strzałki (ostatni poziom)
  const STABILIZACJA_MS = 800;   // ile ms lista ma się nie zmieniać przed kliknięciem
  const MAKS_CZEKANIE_MS = 15000;
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
    if (dane.ok) pokaz('KLIKNIETO: ' + dane.kliknieto + '\ntyp: ' + dane.typ + '\npozycja: ' + dane.pozycja, '#1a7f37');
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
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
      } catch (_) { return false; }
    };

    /* wiersz jest "końcowy", gdy nie ma strzałki rozwijania (button jako dziecko) */
    const koncowy = (w) => {
      try { return !w.querySelector(':scope > button'); } catch (_) { return true; }
    };

    const zbierz = () => {
      let kontenery = [];
      try {
        kontenery = Array.prototype.slice.call(document.querySelectorAll(KONTENER)).filter(widoczny);
      } catch (_) {}
      let najlepszy = null, najwiecej = -1;
      for (let i = 0; i < kontenery.length; i++) {
        let n = 0;
        try { n = kontenery[i].querySelectorAll(WIERSZ).length; } catch (_) {}
        if (n > najwiecej) { najwiecej = n; najlepszy = kontenery[i]; }
      }
      if (!najlepszy) return { wiersze: [], koncowe: [] };
      let wiersze = [];
      try {
        wiersze = Array.prototype.slice.call(najlepszy.querySelectorAll(WIERSZ)).filter(widoczny);
      } catch (_) {}
      return { wiersze, koncowe: wiersze.filter(koncowy) };
    };

    /* czekaj na wiersze + stabilizacja listy (wyniki wyszukiwania muszą się ustalić) */
    const start = Date.now();
    let st = zbierz();
    let poprzednio = st.wiersze.length + '/' + st.koncowe.length;
    let stabilnyOd = Date.now();
    while (true) {
      const gotowe = TYLKO_KONCOWE ? st.koncowe.length > 0 : st.wiersze.length > 0;
      if (gotowe && Date.now() - stabilnyOd >= STABILIZACJA_MS) break;
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') { try { automaResetTimeout(); } catch (_) {} }
      await czekaj(INTERWAL_MS);
      st = zbierz();
      const teraz = st.wiersze.length + '/' + st.koncowe.length;
      if (teraz !== poprzednio) { poprzednio = teraz; stabilnyOd = Date.now(); }
    }

    let lista = TYLKO_KONCOWE ? st.koncowe : st.wiersze;
    let typ = TYLKO_KONCOWE ? 'koncowy (bez strzalki)' : 'dowolny wiersz';
    if (!lista.length && st.wiersze.length) {
      lista = st.wiersze; // awaryjnie: są tylko wiersze ze strzałką
      typ = 'kategoria ze strzalka (brak koncowych)';
    }
    if (!lista.length) {
      return zakoncz({
        ok: false,
        error: 'Nie znaleziono zadnego wiersza listy (' + WIERSZ + ' w ' + KONTENER + '). ' +
          'Lista rozwijana musi byc OTWARTA, zanim ten blok sie uruchomi.',
      });
    }

    /* OSTATNI wiersz — klik w sam wiersz (środek etykiety, nie strzałka) */
    const wiersz = lista[lista.length - 1];
    try { wiersz.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    await czekaj(150);

    const box = wiersz.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;

    let cel = wiersz;
    try {
      const p = document.elementFromPoint(cx, cy);
      if (p && wiersz.contains(p) && p.tagName !== 'BUTTON' && !p.closest('button')) cel = p;
    } catch (_) {}

    const props = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: cx, clientY: cy };
    try {
      cel.dispatchEvent(new PointerEvent('pointerover', props));
      cel.dispatchEvent(new MouseEvent('mouseover', props));
      cel.dispatchEvent(new MouseEvent('mousemove', props));
      cel.dispatchEvent(new PointerEvent('pointerdown', props));
      cel.dispatchEvent(new MouseEvent('mousedown', props));
      cel.dispatchEvent(new PointerEvent('pointerup', props));
      cel.dispatchEvent(new MouseEvent('mouseup', props));
      cel.dispatchEvent(new MouseEvent('click', props));
    } catch (_) {}

    const etykieta = (wiersz.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    zakoncz({
      ok: true,
      kliknieto: etykieta || '<wiersz bez tekstu>',
      typ,
      pozycja: lista.length + ' z ' + lista.length + ' (ostatni)',
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
