/*
 * Blok JavaScript dla Automy — ROTACJA PRZYCISKÓW.
 *
 * Przy każdym uruchomieniu workflow klika DOKŁADNIE JEDEN przycisk
 * pasujący do SELEKTOR — za każdym razem następny z kolei (wg kolejności
 * na stronie), a po ostatnim wraca do pierwszego. Dzięki temu kliknięcia
 * rozkładają się równomiernie, choć każde odpalenie workflow jest osobne.
 *
 * Nie trzeba wypisywać :nth-child(1), :nth-child(2)… — skrypt sam
 * znajduje wszystkie przyciski pasujące do selektora i numeruje je
 * w kolejności występowania na stronie.
 *
 * Numer kolejki jest zapamiętywany w localStorage strony, więc przetrwa
 * między uruchomieniami workflow — także w nowych oknach i kartach tego
 * samego profilu przeglądarki (ale nie w incognito i nie na innym
 * komputerze; wyczyszczenie danych strony zeruje kolejkę).
 *
 * Wymagania w Automie:
 *  - „Execution context" bloku: Active tab
 *  - timeout bloku: min. 20 s
 */
(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR = 'button[data-testid="platform-VINTED"]'; // wspólny selektor wszystkich przycisków
  const KLUCZ_LICZNIKA = 'automa_rotacja_przyciskow';       // nazwa licznika w localStorage
  const MAKS_CZEKANIE_MS = 15000; // ile czekać, aż przyciski pojawią się na stronie; 0 = bez limitu
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

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ===== 1: licznik rotacji w localStorage ===== */
    const odczytajLicznik = () => {
      try {
        const v = parseInt(localStorage.getItem(KLUCZ_LICZNIKA), 10);
        return Number.isInteger(v) && v >= 0 ? v : 0;
      } catch (_) { return 0; }
    };
    const zapiszLicznik = (v) => {
      try { localStorage.setItem(KLUCZ_LICZNIKA, String(v % 1000000)); } catch (_) {}
    };

    /* ===== 2: zbieranie klikalnych przycisków ===== */
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
      let lista = [];
      try {
        lista = Array.prototype.slice.call(document.querySelectorAll(SELEKTOR));
      } catch (_) { lista = []; }
      return lista.filter(klikalny);
    };

    /* ===== 3: czekaj, aż przyciski pojawią się na stronie ===== */
    const start = Date.now();
    let dostepne = zbierz();
    while (!dostepne.length) {
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) {}
      }
      await czekaj(INTERWAL_MS);
      dostepne = zbierz();
    }
    if (!dostepne.length) {
      let znalezionoWszystkich = 0;
      try { znalezionoWszystkich = document.querySelectorAll(SELEKTOR).length; } catch (_) {}
      return zakoncz({
        ok: false,
        error: 'Nie znaleziono żadnego klikalnego przycisku pasującego do: ' + SELEKTOR,
        znalezionoWszystkich, // ile elementów pasuje do selektora, licząc też ukryte/wyłączone
      });
    }

    /* ===== 4: wybór przycisku wg kolejki i kliknięcie ===== */
    const licznik = odczytajLicznik();
    const indeks = licznik % dostepne.length;
    const przycisk = dostepne[indeks];

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

    /* ===== 5: przesuń kolejkę na następny przycisk ===== */
    zapiszLicznik(licznik + 1);

    zakoncz({
      ok: true,
      klikniety: (indeks + 1) + ' z ' + dostepne.length,
      kliknieto:
        przycisk.getAttribute('aria-label') ||
        (przycisk.textContent || '').trim().slice(0, 80) ||
        SELEKTOR + ':nth (' + (indeks + 1) + ')',
      nastepnyBedzie: ((licznik + 1) % dostepne.length) + 1,
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
