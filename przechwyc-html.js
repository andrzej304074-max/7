/*
 * Blok JavaScript dla Automy — PRZECHWYĆ HTML LISTY.
 *
 * Uruchom, gdy lista rozwijana jest OTWARTA. Blok zbierze HTML pasujących
 * fragmentów strony i pokaże go w dużym okienku z polem tekstowym.
 * Zawartość jest od razu zaznaczona — wystarczy Ctrl+C i wkleić do czatu.
 *
 * Ustawienia bloku w Automie: Execution context = Active tab.
 */
(async () => {
  const SELEKTORY = [
    'div.p-1:nth-child(2)',
    'div.p-1',
    '[role="listbox"]',
    '[role="option"]',
    '[class*="dropdown"]',
    '[class*="select"]',
  ];
  const LIMIT_NA_ELEMENT = 4000;   // znaków HTML na jeden element
  const LIMIT_CALOSCI = 16000;     // łączny limit znaków

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      console.log('[przechwyc-html] Brak dostępu do strony — Execution context = Active tab.');
      if (typeof automaNextBlock === 'function') {
        automaNextBlock({ ok: false, error: 'Brak dostępu do strony — Execution context = Active tab.' });
      }
      return;
    }

    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
      } catch (_) { return false; }
    };

    let raport = 'URL: ' + location.href + '\n\n';
    for (let s = 0; s < SELEKTORY.length; s++) {
      const sel = SELEKTORY[s];
      let m = [];
      try { m = Array.prototype.slice.call(document.querySelectorAll(sel)); } catch (_) { continue; }
      const widoczne = m.filter(widoczny);
      raport += '===== ' + sel + '  (pasuje: ' + m.length + ', widocznych: ' + widoczne.length + ') =====\n';
      const pokazane = (widoczne.length ? widoczne : m).slice(0, 2);
      for (let i = 0; i < pokazane.length; i++) {
        let html = '';
        try { html = pokazane[i].outerHTML || ''; } catch (_) {}
        if (html.length > LIMIT_NA_ELEMENT) {
          html = html.slice(0, LIMIT_NA_ELEMENT) + '\n...[uciete]...';
        }
        raport += html + '\n----------\n';
        if (raport.length > LIMIT_CALOSCI) break;
      }
      raport += '\n';
      if (raport.length > LIMIT_CALOSCI) {
        raport = raport.slice(0, LIMIT_CALOSCI) + '\n...[calosc ucieta]...';
        break;
      }
    }

    /* okienko z polem tekstowym na stronie */
    const stare = document.getElementById('automa-html-dump');
    if (stare) stare.remove();
    const box = document.createElement('div');
    box.id = 'automa-html-dump';
    box.style.cssText =
      'position:fixed;z-index:2147483647;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:min(860px,92vw);height:min(560px,80vh);background:#111827;border-radius:12px;' +
      'box-shadow:0 8px 40px rgba(0,0,0,.6);display:flex;flex-direction:column;padding:14px;gap:10px';
    const naglowek = document.createElement('div');
    naglowek.style.cssText = 'color:#fff;font:14px/1.4 monospace;display:flex;justify-content:space-between;align-items:center';
    naglowek.textContent = 'HTML listy — nacisnij Ctrl+C (tekst jest juz zaznaczony), potem wklej do czatu';
    const zamknij = document.createElement('button');
    zamknij.textContent = 'Zamknij';
    zamknij.style.cssText = 'margin-left:12px;padding:6px 14px;border:0;border-radius:8px;background:#374151;color:#fff;cursor:pointer;font:13px monospace';
    zamknij.onclick = () => box.remove();
    naglowek.appendChild(zamknij);
    const pole = document.createElement('textarea');
    pole.readOnly = true;
    pole.value = raport;
    pole.style.cssText =
      'flex:1;width:100%;resize:none;background:#1f2937;color:#d1fae5;border:0;border-radius:8px;' +
      'padding:10px;font:12px/1.45 monospace;white-space:pre;overflow:auto';
    box.appendChild(naglowek);
    box.appendChild(pole);
    document.documentElement.appendChild(box);
    try { pole.focus(); pole.select(); } catch (_) {}
    try { await navigator.clipboard.writeText(raport); naglowek.textContent = 'HTML skopiowany do schowka — wklej do czatu (Ctrl+V).'; naglowek.appendChild(zamknij); } catch (_) {}

    console.log('[przechwyc-html]', raport);
    if (typeof automaNextBlock === 'function') automaNextBlock({ ok: true, dlugosc: raport.length });
  } catch (err) {
    console.log('[przechwyc-html] blad:', err);
    if (typeof automaNextBlock === 'function') automaNextBlock({ ok: false, error: String(err) });
  }
})();
