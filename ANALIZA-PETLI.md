# Dlaczego automatyzacja psuje się dopiero po dłuższej pracy

Analiza 7 wyeksportowanych workflow (Automa 1.30.02, eksporty z 25.07.2026):
`decider`, `spodnie meskie`, `spodenki krotkie meskie`, `bluzy koszulki meskie`,
`spodnie damskie`, `spodenki krotkie damskie`, `bluzy koszulki damskie`.

Wszystko poniżej wynika z zawartości plików `.automa.json` — nie ze zgadywania.
Tam, gdzie coś jest hipotezą, jest to napisane wprost.

---

## 1. Kształt pętli

Każdy workflow **kończy się** blokiem `Execute workflow`, który wskazuje na następny:

```
decider ─▶ spodnie meskie ─▶ spodenki krotkie meskie ─▶ bluzy koszulki meskie
   ▲                                                              │
   └──── bluzy koszulki damskie ◀── spodenki krotkie damskie ◀── spodnie damskie
```

Krąg zamknięty, 7 elementów. W workflow produktowych są **3 bloki
`Execute workflow`** (po jednym na każdą gałąź zakończenia) — wszystkie
wskazują na ten sam, następny workflow. Żaden z nich nie ma nic podpiętego
na wyjściu: to ostatni blok gałęzi.

**Sam czas trwania jednego okrążenia:** same bloki `Delay` to **62 minuty**
(530 s + 530 s + 530 s + 490 s + 490 s + 490 s + 661 s), nie licząc realnego
czasu ładowania stron, pobierania i uploadów.

---

## 2. Przyczyna #1 — pętla nigdy się nie „zwija" (kumulacja instancji)

Blok `Execute workflow` w Automie **czeka na zakończenie** wywołanego workflow
(w kodzie: `const result = await workflowListener(workflow, options);` —
promise rozwiązuje się dopiero po zdarzeniu `destroyed` silnika dziecka).

Ponieważ krąg jest zamknięty, dziecko **nigdy się nie kończy** — zawsze woła
kolejne. Efekt: to nie jest pętla, tylko **nieskończona rekurencja**.

Po 10 okrążeniach w pamięci rozszerzenia żyje **70 zagnieżdżonych instancji**
workflow (7 × 10), każda z własnym silnikiem, stanem, logami i referencjami do
kart. Po 5 godzinach — kilkaset. Nic nigdy nie jest zwalniane.

To dokładnie tłumaczy objaw „na początku działa idealnie, potem zaczyna sypać":
rozszerzenie stopniowo dławi się własnym stanem, wszystko zwalnia, a bloki
z krótkimi limitami czasu (patrz punkt 4) zaczynają przekraczać limity.

**Poprawka:** krąg musi zostać przerwany. Jeden `decider` w roli sterownika,
który po kolei wywołuje 6 workflow produktowych i **wraca** do siebie,
a pętlę robi trigger (`Interval`) albo blok `Repeat task` — zamiast łańcucha,
w którym każdy woła następnego i czeka w nieskończoność.

---

## 3. Sprzątanie kart i okien — sprawdzone, jest w porządku

**Tu nie ma wycieku.** Każdy workflow zaczyna się blokiem `New window`
i **każda gałąź kończąca kończy się blokiem zamykającym całe okno**, tuż przed
`Execute workflow`:

```json
{ "closeType": "window", "activeTab": true, "allWindows": false }
```

Nie jest to zamknięcie jednej karty — `closeType: "window"` zamyka **okno wraz
ze wszystkimi kartami**, które workflow w nim pootwierał. Bilans:

| workflow | `New window` | zamknięcia okna | dodatkowo `Close tab` |
|---|---|---|---|
| każdy produktowy (×6) | 1 | 3 (po jednym na każdą gałąź końcową) | 0 |
| decider | 1 | 1 | 20 (sprzątanie w trakcie) |

W kodzie Automy blok dostaje `this.windowId` silnika, czyli zamyka **okno tego
workflow**, nie okno użytkownika. 15 kart otwartych w trakcie jednego przebiegu
znika razem z oknem.

Jedyne zastrzeżenie: gdyby `this.windowId` był nieustawiony (np. gdyby blok
`New window` poszedł w `fallback` i okno nigdy nie powstało), Automa spada do
`windows.getCurrent()` — wtedy zamknie okno aktualnie aktywne. To wąski
przypadek brzegowy, nie codzienna ścieżka.

---

## 4. Przyczyna #3 — wyścig przy pobieraniu i wgrywaniu plików

To najbardziej prawdopodobne źródło błędów typu „raz idealnie, raz błąd"
**niezależnych od czasu pracy**.

Blok `Handle download` (11 sztuk w każdym produktowym, 5 w deciderze):

```json
{ "filename": "ref3", "onConflict": "overwrite",
  "waitForDownload": true, "timeout": 1000 }
```

**Limit oczekiwania na pobranie to 1 sekunda.** Zdjęcie z Gmaila czy plik
z iLoveIMG rzadko schodzi w 1 s. Po przekroczeniu limitu blok leci w gałąź
`fallback` → `Delay` → i workflow **idzie dalej, jakby nic się nie stało**.

A dalej czeka `Upload file` ze **sztywną ścieżką**:

```json
{ "filePaths": ["/Users/andrzejkluba/Downloads/pro1.jpg"] }
```

Więc gdy pobieranie nie zdążyło, blok wgrywa **plik z poprzedniego okrążenia**
(albo częściowo pobrany, albo — jeśli nadpisanie się nie powiodło —
`pro1 (1).jpg` zostaje na dysku i rośnie bałagan). Raz trafi dobry plik,
raz stary. Stąd „czasami działa idealnie".

**Poprawka:**
1. `timeout` w `Handle download` → **30 000–60 000 ms**.
2. Włączyć `retry` na tych blokach (patrz punkt 6).
3. Kasować pliki z `~/Downloads` przed każdym okrążeniem albo używać
   nazw ze znacznikiem czasu i przekazywać ścieżkę przez zmienną
   (`Assign variable` w `Handle download`) zamiast wpisywać ją na sztywno.

---

## 5. Przyczyna #4 — przełączanie kart „względne"

Wszystkie bloki `Switch tab` (13 w każdym produktowym, 20 w deciderze) używają:

```json
{ "findTabBy": "prev-tab" }   // albo "next-tab"
```

To nawigacja **po pozycji**, nie po adresie. W jednym oknie workflow trzyma
naraz kilkanaście kart (15 bloków `New tab` w produktowym, 39 w deciderze),
a `prev-tab`/`next-tab` liczy sąsiada względem bieżącej.

Wystarczy jedna nadmiarowa karta w tym oknie — otwarta przez samą stronę
(`target=_blank`), przez podgląd pobranego pliku, przez reklamę — i od tego
momentu **każdy kolejny `Switch tab` trafia o jedną kartę obok**. Kliknięcia
lecą wtedy w przypadkową stronę, a błąd wyskakuje dopiero kilka bloków dalej,
w zupełnie niepowiązanym miejscu.

To nie kumuluje się między okrążeniami (okno jest zamykane, patrz punkt 3),
ale w obrębie jednego przebiegu jest to loteria zależna od tego, co akurat
zrobi strona.

**Poprawka:** `Switch tab` → `Match tab URL` z wzorcem (np. `*://chatgpt.com/*`,
`*://mail.google.com/*`) zamiast `prev-tab` / `next-tab`.

---

## 6. Przyczyna #5 — limity 5 s i wyłączone ponawianie

**Limity czekania na element** (`waitSelectorTimeout`):

| blok | ile sztuk | limit |
|---|---|---|
| `event-click` | 91–92 w każdym produktowym, 180 w deciderze | **5 000 ms** |
| `upload-file` | 14 / 48 | 5 000 ms |
| `forms` | 3 / 19 | 5 000 ms |
| `forms` | 24 | 10 000 ms |

5 sekund wystarcza na Gmaila/ChatGPT/iLoveIMG na wypoczętej przeglądarce.
Nie wystarcza, gdy w tym samym oknie trwa upload, schodzi pobieranie i rośnie
zajętość pamięci z punktu 2. **To jest dokładnie ten mechanizm, przez który
ten sam blok raz przechodzi, a raz nie.**

**Obsługa błędów** — 195 z 197 bloków w workflow produktowych (331 w deciderze)
ma:

```json
{ "enable": true, "retry": false, "retryTimes": 1, "toDo": "fallback" }
```

Czyli: **ponawianie wyłączone**, a przy błędzie sterowanie idzie w `fallback`,
który we wszystkich przypadkach prowadzi do bloku `Delay` i dalej w główny nurt.
Workflow **nie zatrzymuje się na błędzie — brnie dalej z brakującymi danymi**.
Dlatego błędy zgłaszane w logu często wskazują blok, który sam w sobie jest
w porządku: prawdziwa awaria wydarzyła się kilkanaście bloków wcześniej.

**Poprawka:** `Retry` = włączone, `Retry times` = 2–3, `Retry interval` = 2 s,
`waitSelectorTimeout` = 15 000–20 000 ms.

Dodatkowo w **deciderze 9 bloków** ma włączoną obsługę błędu z akcją `fallback`,
ale **nic nie jest podpięte do wyjścia fallback** — tam błąd po prostu kończy
gałąź i workflow cicho się urywa.

---

## 7. Przyczyna #6 — `Element exists` odpytujący stronę 200 razy na sekundę

W deciderze 48 bloków ma `tryCount = 80000`, `timeout = 5`.

W kodzie Automy `timeout` to **odstęp między próbami**, a `tryCount` to ich
liczba, więc jeden taki blok to:

* sprawdzanie DOM **co 5 ms — 200 zapytań na sekundę**,
* maksymalny czas czekania **80 000 × 5 ms ≈ 6 min 40 s** na jeden blok,
* łącznie w deciderze do **~5,5 godziny** samego czekania w pesymistycznym
  przypadku (19 845 s).

Przy `.overflow-visible\!:nth-child(2) .icon-md:nth-child(1)` na ChatGPT to
oznacza ciągłe obciążanie strony zapytaniami — dokładnie wtedy, gdy strona
i tak walczy o zasoby.

**Poprawka:** `tryCount = 600`, `timeout = 500` (to samo 5 minut czekania,
ale 2 zapytania na sekundę zamiast 200).

---

## 8. Drobniejsze rzeczy warte poprawienia

| co | gdzie | dlaczego |
|---|---|---|
| `execContext: "popup"` | ustawienia wszystkich 7 workflow | workflow żyje w popupie rozszerzenia; zamknięcie/przeładowanie popupu ubija wszystko. Przy pracy wielogodzinnej lepsze `background` |
| `blockDelay: 0` | ustawienia wszystkich 7 | brak oddechu między blokami; 300–500 ms globalnie zdejmuje sporo wyścigów |
| selektory pozycyjne w Gmailu | `div[role="main"] table tr:first-child`, `span.aZo:nth-of-type(2)` | „pierwszy wiersz skrzynki" zależy od tego, co akurat przyszło. Nowa wiadomość w trakcie okrążenia = klik w niewłaściwy mail |
| 27 nieosiągalnych bloków | `decider` | pozostałości po edycji; nie szkodzą, ale utrudniają czytanie logu |
| wspólny licznik rotacji | `click-rotation.js`, klucz `automa_rotacja_przyciskow` | wszystkie 7 workflow dzielą jeden licznik w `localStorage` tej samej domeny — rotacja przycisków przeskakuje między workflow. Do sprawdzenia, czy tak miało być |
| brak limitu logów | `saveLog: true` | przy pracy ciągłej log rośnie bez końca i spowalnia rozszerzenie |
| serwisy zewnętrzne | iLoveIMG, Aspose, ChatGPT | hipoteza: przy kilkudziesięciu okrążeniach dziennie wchodzą limity/captcha po stronie tych usług. Warto sprawdzić w logu, czy błędy nie kumulują się właśnie na tych domenach |

---

## 9. Kolejność napraw

**Najpierw (bez tego reszta niewiele da):**

1. **Rozerwać krąg `Execute workflow`** — sterownik + `Repeat task`/trigger
   zamiast 7 workflow wołających się nawzajem w nieskończoność (punkt 2).
2. **`Handle download`: timeout 1 000 → 30 000 ms** + ponawianie + porządek
   z plikami w `~/Downloads` (punkt 4).

**Potem:**

3. `waitSelectorTimeout` 5 000 → 15 000–20 000 ms we wszystkich blokach.
4. `Switch tab`: `prev-tab`/`next-tab` → dopasowanie po URL.
5. `Element exists`: `80000 × 5 ms` → `600 × 500 ms`.
6. Włączyć `Retry` (2–3 próby, co 2 s) na blokach klikających i wgrywających.
7. Podpiąć brakujące gałęzie `fallback` w deciderze (9 bloków).
8. `execContext` → `background`, `blockDelay` → 300–500 ms.

Punkty 3–8 da się zrobić hurtem skryptem na plikach `.automa.json`
(zmiana wartości + ponowny import do Automy), bez ręcznego klikania
po kilkuset blokach.
