/*
 * Blok JavaScript dla Automy — DIAGNOSTYKA (nie zmienia strony poza kliknięciem próbnym).
 *
 * Sprawdza, co skrypt widzi na stronie dla danego kontenera, i zwraca to
 * do następnego bloku / do konsoli. Na końcu PRÓBUJE kliknąć ostatni blok.
 * Wklej wynik z logu Automy tutaj, żeby dobrać poprawny selektor.
 *
 * Wymagania w Automie:
 *  - „Execution context" bloku: Active tab
 */
(async () => {
  const KONTENER = 'div.p-1:nth-child(2)'; // <- ten sam selektor, co wcześniej

  const wynik = { ok: true, KONTENER };
  const koniec = (d) => {
    const out = Object.assign({}, wynik, d);
    console.log('[diagnostyka]', out);
    if (typeof automaNextBlock === 'function') automaNextBlock(out);
  };

  try {
    if (typeof document === 'undefined') {
      return koniec({ ok: false, error: 'Brak dostępu do strony — ustaw Execution context na "Active tab".' });
    }

    const opis = (el) => {
      if (!el) return null;
      const klasy = (el.getAttribute('class') || '').slice(0, 120);
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      return '<' + el.tagName.toLowerCase() + (klasy ? ' class="' + klasy + '"' : '') + '> ' + txt;
    };

    /* 1: ile kontenerów pasuje do selektora */
    let kontenery = [];
    try { kontenery = Array.prototype.slice.call(document.querySelectorAll(KONTENER)); } catch (e) {
      return koniec({ ok: false, error: 'Zły selektor kontenera: ' + e.message });
    }
    wynik.ileKontenerow = kontenery.length;

    if (!kontenery.length) {
      // podpowiedz: pokaż istniejące div.p-1 i ich pozycje
      let wszystkiePodobne = [];
      try {
        wszystkiePodobne = Array.prototype.slice.call(document.querySelectorAll('div.p-1'))
          .slice(0, 10).map(opis);
      } catch (_) {}
      return koniec({
        ok: false,
        error: 'Nie znaleziono kontenera: ' + KONTENER,
        istniejaceDivP1: wszystkiePodobne,
      });
    }

    const kontener = kontenery[0];
    wynik.kontenerOpis = opis(kontener);

    /* 2: pokaż dzieci kontenera na różnych poziomach */
    const dzieciBezposrednie = Array.prototype.slice.call(kontener.children);
    wynik.ileDzieciBezposrednich = dzieciBezposrednie.length;
    wynik.dzieciBezposrednie = dzieciBezposrednie.slice(0, 12).map(opis);

    /* 3: policz różne typowe kandydatury na "blok" wewnątrz */
    const policz = (sel) => {
      try { return kontener.querySelectorAll(sel).length; } catch (_) { return -1; }
    };
    wynik.liczby = {
      'wszystkie potomki (*)': policz('*'),
      'div bezposrednie (:scope > div)': policz(':scope > div'),
      'button (dowolnie glęboko)': policz('button'),
      'a (linki)': policz('a'),
      '[role=button]': policz('[role=button]'),
    };

    /* 4: opis ostatniego dziecka bezpośredniego */
    if (dzieciBezposrednie.length) {
      const ostatnie = dzieciBezposrednie[dzieciBezposrednie.length - 1];
      wynik.ostatnieDziecko = opis(ostatnie);
      // co klikalnego jest w środku ostatniego dziecka?
      let klikalneWSrodku = [];
      try {
        klikalneWSrodku = Array.prototype.slice
          .call(ostatnie.querySelectorAll('button, a, [role=button]'))
          .slice(0, 5).map(opis);
      } catch (_) {}
      wynik.klikalneWOstatnimDziecku = klikalneWSrodku;

      /* 5: próbne kliknięcie ostatniego dziecka */
      try {
        const cel = ostatnie;
        cel.scrollIntoView({ block: 'center' });
        const r = cel.getBoundingClientRect();
        const props = {
          bubbles: true, cancelable: true, composed: true, view: window, button: 0,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        };
        ['pointerover','pointerdown','pointerup'].forEach((t) => cel.dispatchEvent(new PointerEvent(t, props)));
        ['mouseover','mousedown','mouseup','click'].forEach((t) => cel.dispatchEvent(new MouseEvent(t, props)));
        wynik.probaKlikniecia = 'wyslano zdarzenia do ostatniego dziecka';
      } catch (e) {
        wynik.probaKlikniecia = 'blad: ' + e.message;
      }
    }

    koniec({});
  } catch (err) {
    koniec({ ok: false, error: (err && err.message) || String(err) });
  }
})();
