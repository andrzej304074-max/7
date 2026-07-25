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
 * Ustawienia bloku w Automie: Execution context = Active tab,
 * timeout bloku ≥ MAKS_CZEKANIE_MS + 10 s (patrz README.md).
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
  const PROBY_KLIKNIECIA = 3;    // ile razy ponowić klik, gdy nie zadziałał
  const SPRAWDZAJ_SKUTEK = true; // true = po kliknięciu upewnij się, że lista zareagowała
  /* ========================== */

  const bezLimitu = !(MAKS_CZEKANIE_MS > 0);

  /* ================= WSPÓLNY RDZEŃ ODPORNOŚCI =================
   * Naprawia błędy, które pojawiają się dopiero przy długiej pracy
   * w pętli między workflow (szczegóły w README.md):
   *  1) UNIEWAŻNIANIE STARYCH URUCHOMIEŃ — zawieszone uruchomienie tego
   *     bloku (np. gdy karta była w tle i timery zostały uśpione) potrafiło
   *     wywołać automaNextBlock już W TRAKCIE następnego uruchomienia
   *     i przerwać je obcym błędem „watchdog…". Każde nowe uruchomienie
   *     unieważnia poprzednie, a watchdog jest sprzątany po zakończeniu.
   *  2) ZEGAR LICZĄCY TYLKO CZAS AKTYWNY — Chrome usypia setTimeout
   *     w kartach w tle, przez co limit 15 s potrafił „zejść" w kilka
   *     sekund realnej pracy strony.
   *  3) KLIK Z PONOWIENIEM — element wymieniony przez re-render Reacta,
   *     przykryty overlayem albo klik bez skutku → próba jeszcze raz
   *     na świeżo wyszukanym elemencie.
   */
  const RUN = { przerwany: false };
  try {
    if (window.__automaKlikRun) window.__automaKlikRun.przerwany = true;
    window.__automaKlikRun = RUN;
  } catch (_) {}

  const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

  const zegar = (() => {
    const start = Date.now();
    let aktywny = 0;
    let ostatni = Date.now();
    let byloWidoczne = !document.hidden;
    const tik = () => {
      const t = Date.now();
      if (byloWidoczne) aktywny += t - ostatni;
      ostatni = t;
      byloWidoczne = !document.hidden;
    };
    try { document.addEventListener('visibilitychange', tik, true); } catch (_) {}
    return { aktywnyMs: () => { tik(); return aktywny; }, realnyMs: () => Date.now() - start };
  })();

  /* limit liczony w czasie aktywnym; twardy bezpiecznik na czas realny */
  const przekroczono = (limit) =>
    limit > 0 && (zegar.aktywnyMs() >= limit || zegar.realnyMs() >= limit * 4);

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
      /* plakietkę usuwa tylko to uruchomienie, które ją wystawiło */
      const moja = el;
      setTimeout(() => {
        try { if (moja.textContent === tekst) moja.remove(); } catch (_) {}
      }, PLAKIETKA_MS);
    } catch (_) {}
  };

  let zakonczono = false;
  let watchdog = null;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (watchdog) { try { clearTimeout(watchdog); } catch (_) {} }
    if (RUN.przerwany) {
      /* to uruchomienie zostało zastąpione przez nowsze — nie wolno mu
         wywołać automaNextBlock, bo przerwałoby cudzy, trwający blok */
      console.log('[click-last] uruchomienie uniewaznione, pomijam wynik:', dane);
      return;
    }
    console.log('[click-last]', dane);
    if (dane.ok) pokaz('KLIKNIETO: ' + dane.kliknieto + '\ntyp: ' + dane.typ + '\npozycja: ' + dane.pozycja, '#1a7f37');
    else pokaz('BLAD: ' + dane.error, '#b91c1c');
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
  };

  if (!bezLimitu) {
    const pilnuj = () => {
      if (zakonczono || RUN.przerwany) return;
      if (przekroczono(MAKS_CZEKANIE_MS + 5000)) {
        return zakoncz({ ok: false, error: 'watchdog: przekroczono limit czasu' });
      }
      watchdog = setTimeout(pilnuj, 1000);
    };
    watchdog = setTimeout(pilnuj, 1000);
  }

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({ ok: false, error: 'Brak dostępu do strony — Execution context musi byc "Active tab".' });
    }

    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
      } catch (_) { return false; }
    };

    /* czekaj, aż element przestanie się przesuwać (scroll-behavior: smooth,
       doładowywanie listy) — inaczej klikamy we współrzędne sprzed przewinięcia */
    const ustabilizujPozycje = async (el) => {
      let poprzednia = null;
      for (let i = 0; i < 10; i++) {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        const teraz = Math.round(r.top) + ':' + Math.round(r.left);
        if (teraz === poprzednia) return;
        poprzednia = teraz;
        await czekaj(50);
      }
    };

    const wyslijKlik = (cel, cx, cy) => {
      const wcisniety = {
        bubbles: true, cancelable: true, composed: true, view: window,
        button: 0, buttons: 1, detail: 1,
        clientX: cx, clientY: cy, screenX: cx, screenY: cy,
        pointerId: 1, pointerType: 'mouse', isPrimary: true,
      };
      const luzny = Object.assign({}, wcisniety, { buttons: 0 });
      cel.dispatchEvent(new PointerEvent('pointerover', luzny));
      cel.dispatchEvent(new MouseEvent('mouseover', luzny));
      cel.dispatchEvent(new PointerEvent('pointermove', luzny));
      cel.dispatchEvent(new MouseEvent('mousemove', luzny));
      cel.dispatchEvent(new PointerEvent('pointerdown', wcisniety));
      cel.dispatchEvent(new MouseEvent('mousedown', wcisniety));
      try { if (typeof cel.focus === 'function') cel.focus({ preventScroll: true }); } catch (_) {}
      cel.dispatchEvent(new PointerEvent('pointerup', luzny));
      cel.dispatchEvent(new MouseEvent('mouseup', luzny));
      cel.dispatchEvent(new MouseEvent('click', luzny));
    };

    /*
     * znajdz  – funkcja zwracająca ŚWIEŻY element przy każdej próbie
     *           (nie trzymamy referencji między próbami — po re-renderze
     *           Reacta stara referencja wskazuje na element poza drzewem)
     * sprawdz – opcjonalnie: (el) => true, gdy klik faktycznie zadziałał
     */
    const klikNiezawodnie = async (znajdz, opcje) => {
      const proby = (opcje && opcje.proby) || 3;
      const sprawdz = opcje && opcje.sprawdz;
      const unikajButtona = !!(opcje && opcje.unikajButtona);
      let ostatniBlad = 'nie znaleziono elementu do kliknięcia';

      for (let p = 1; p <= proby; p++) {
        if (RUN.przerwany) return { ok: false, blad: 'uruchomienie unieważnione' };

        const el = znajdz();
        if (!el) { ostatniBlad = 'element zniknął ze strony przed kliknięciem'; await czekaj(300); continue; }

        try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
        await ustabilizujPozycje(el);
        if (!el.isConnected) { ostatniBlad = 'element wymieniony przez re-render strony'; await czekaj(200); continue; }

        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;

        /* co naprawdę leży pod kursorem w tym punkcie */
        let cel = el;
        let wierzch = null;
        try { wierzch = document.elementFromPoint(cx, cy); } catch (_) {}
        if (wierzch && el.contains(wierzch)) {
          const toStrzalka = wierzch.tagName === 'BUTTON' || (wierzch.closest && wierzch.closest('button'));
          cel = unikajButtona && toStrzalka ? el : wierzch;
        } else if (wierzch && wierzch !== el && !wierzch.contains(el)) {
          ostatniBlad = 'element przykryty przez <' + wierzch.tagName.toLowerCase() + '> (overlay / spinner)';
          await czekaj(400);
          continue;
        }

        wyslijKlik(cel, cx, cy);
        if (!sprawdz) return { ok: true, el, proba: p };

        const potwierdz = async (ms) => {
          const doKiedy = Date.now() + ms;
          while (Date.now() < doKiedy) {
            try { if (sprawdz(el)) return true; } catch (_) {}
            await czekaj(100);
          }
          return false;
        };
        if (await potwierdz(1500)) return { ok: true, el, proba: p };

        /* awaryjnie natywny .click() — część komponentów ignoruje same zdarzenia */
        try { if (el.isConnected) el.click(); } catch (_) {}
        if (await potwierdz(800)) return { ok: true, el, proba: p, natywnyClick: true };

        ostatniBlad = 'klik nie wywołał żadnej zmiany na stronie';
        await czekaj(300);
      }
      return { ok: false, blad: ostatniBlad };
    };
    /* ============= KONIEC WSPÓLNEGO RDZENIA ============= */

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
    let st = zbierz();
    let poprzednio = st.wiersze.length + '/' + st.koncowe.length;
    let stabilnyOd = Date.now();
    while (true) {
      const gotowe = TYLKO_KONCOWE ? st.koncowe.length > 0 : st.wiersze.length > 0;
      if (gotowe && Date.now() - stabilnyOd >= STABILIZACJA_MS) break;
      if (przekroczono(MAKS_CZEKANIE_MS)) break;
      if (RUN.przerwany) return;
      if (typeof automaResetTimeout === 'function') { try { automaResetTimeout(); } catch (_) {} }
      await czekaj(INTERWAL_MS);
      st = zbierz();
      const teraz = st.wiersze.length + '/' + st.koncowe.length;
      if (teraz !== poprzednio) { poprzednio = teraz; stabilnyOd = Date.now(); }
    }

    let uzyjKoncowych = TYLKO_KONCOWE && st.koncowe.length > 0;
    let typ = uzyjKoncowych ? 'koncowy (bez strzalki)' : 'dowolny wiersz';
    if (TYLKO_KONCOWE && !uzyjKoncowych && st.wiersze.length) {
      typ = 'kategoria ze strzalka (brak koncowych)'; // awaryjnie: są tylko wiersze ze strzałką
    }
    const listaTeraz = () => {
      const s = zbierz();
      return uzyjKoncowych ? s.koncowe : s.wiersze;
    };

    const lista = listaTeraz();
    if (!lista.length) {
      return zakoncz({
        ok: false,
        error: 'Nie znaleziono zadnego wiersza listy (' + WIERSZ + ' w ' + KONTENER + '). ' +
          'Lista rozwijana musi byc OTWARTA, zanim ten blok sie uruchomi.',
      });
    }

    /* etykieta zapamiętana PRZED klikiem — po wyborze lista zwykle znika */
    const wiersz = lista[lista.length - 1];
    const etykieta = (wiersz.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const ileWiderszy = lista.length;

    /* OSTATNI wiersz — klik w sam wiersz (środek etykiety, nie strzałka).
       Element wyszukiwany na nowo przy każdej próbie. */
    const wynik = await klikNiezawodnie(() => {
      const l = listaTeraz();
      return l.length ? l[l.length - 1] : null;
    }, {
      proby: PROBY_KLIKNIECIA,
      unikajButtona: true,
      /* skutek kliknięcia: wiersz znika z DOM, lista się zamyka
         albo wiersz zostaje oznaczony jako wybrany */
      sprawdz: SPRAWDZAJ_SKUTEK
        ? (el) => !el.isConnected ||
                  listaTeraz().length === 0 ||
                  el.getAttribute('aria-selected') === 'true' ||
                  el.getAttribute('data-selected') === 'true'
        : null,
    });

    if (!wynik.ok) {
      return zakoncz({
        ok: false,
        error: 'Nie udalo sie kliknac ostatniego wiersza („' + etykieta + '"): ' + wynik.blad,
        typ,
        probowanoRazy: PROBY_KLIKNIECIA,
        czekalemMs: zegar.realnyMs(),
      });
    }

    zakoncz({
      ok: true,
      kliknieto: etykieta || '<wiersz bez tekstu>',
      typ,
      pozycja: ileWiderszy + ' z ' + ileWiderszy + ' (ostatni)',
      proba: wynik.proba,
      czekalemMs: zegar.realnyMs(),
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
