# Presentatie-script — PingFin Team 20

> **30 minuten** — 4 sprekers
> Slot indeling: Probleemstelling → Code highlights → Demo → Reflectie → Q&A

---

## Slide 1 — Titelpagina (30s)

**Salah:**
> "Goedemiddag. Wij zijn team 20 — Salah, Abdallah, Ayoub en Marwan. We hebben twee SEPA-banken gebouwd: Bank 1 met BIC `CEKVBE88` en Bank 2 met BIC `HOMNBEB1`. Beide draaien live op Railway en hebben deze week meer dan duizend payment orders verwerkt."

---

## Slide 2 — Probleemstelling (3 min)

**Salah:**

### Wat is PingFin?
> "PingFin simuleert het Single Euro Payments Area systeem in het klein. Verschillende studententeams spelen elk een bank — gewone banken (zoals wij) of de Clearing Bank in het midden. Een betaling reist als een 'ping': originating bank verstuurt → clearing bank routeert → beneficiary bank ontvangt → acknowledgement reist terug."

### Onze rol
> "Ons team bouwt **twee gewone banken**. Elke bank moet:
> - PO's kunnen **verzenden** (als OB) en **ontvangen** (als BB)
> - Foutgevallen veerkrachtig afhandelen
> - Een GUI bieden voor monitoring
> - Een log bijhouden van alle events"

### Manuel-eisen waar we mee werkten
> "We moesten:
> - Maximum €500 per betaling
> - Geen negatief saldo toelaten
> - Elke PO moet binnen 1 uur een ACK krijgen anders refund
> - Elk bedrag max 2 decimalen, datums in YYYY-MM-DD HH:MM:SS, IBANs en BICs valideren
> - Bearer-token authenticatie voor inkomende endpoints"

**[volgende slide]**

---

## Slide 3 — Architectuur (2 min)

**Marwan:**

> "We hebben gekozen voor een **moderne, simpele stack**:
> - **Node.js + Express** voor de API — async/await voor onze poll-jobs
> - **MySQL 8** voor data — twee aparte databases, één per bank
> - **Vanilla HTML/CSS/JS** voor de GUI — geen framework, geen build-stap
> - **Docker Compose** voor reproduceerbare deployment
> - **Railway** voor live hosting met HTTPS"

> "Elke bank is een **zelfstandige folder** — `Bank 1/` en `Bank 2/` — met eigen Dockerfile en compose. Je kan ze los starten of samen via een root compose-file. De code zelf is identiek tussen beide banken; alleen de `.env` met BIC + token verschilt."

**[architectuur diagram tonen]**

---

## Slide 4 — Code Highlights (5 min)

**Ayoub:**

### Highlight 1: Atomische DB-transacties

> "Bij élke geld-beweging gebruiken we een DB-transactie. Vier schrijf-acties — balance update, po_in/out insert, transaction insert, ack_out insert — worden als één eenheid behandeld. Als iets faalt, draaien we alles terug. Geen half-verwerkte staat mogelijk."

```js
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', ...);
  await conn.query('INSERT INTO po_in ...');
  await conn.query('INSERT INTO transactions ...');
  await conn.query('INSERT INTO ack_out ...');
  await conn.commit();
} catch (err) {
  await conn.rollback();
}
```

### Highlight 2: Validatie als guard clauses

> "Validatie staat in `lib/validate.js` als pure functies. We hebben gekozen voor **early-return guard clauses** in plaats van geneste if-else. Je leest de code top-down als een checklist, exact zoals de manual de regels opsomt."

```js
if (po.bb_id !== BIC) return reject(BB_UNKNOWN);
if (!validPoIdFormat(po.po_id)) return reject(OB_MISMATCH);
if (!validIban(po.ba_id)) return reject(ACCOUNT_UNKNOWN);
if (amountErrorCode(po.po_amount)) return reject(amountErrorCode(...));
// ... als we hier komen, alles OK → atomic credit
```

### Highlight 3: Veerkracht via background jobs

> "Vijf achtergrond-processen draaien zelfstandig:
> 1. **pollPoOut** elke 30s → check of er nieuwe PO's voor ons zijn
> 2. **pollAckOut** elke 30s → check of onze verstuurde PO's een ACK kregen
> 3. **flushAckOut** elke 60s → retry voor ACK's die niet meteen door CB werden geaccepteerd
> 4. **timeoutMonitor** elke 5min → na 1u zonder ACK refund OA
> 5. **cbToken** elke 3.5h → token vernieuwen voor het verloopt"

> "Dat betekent: als de CB even down is, of als we crashen, **valt het systeem terug op zelfgenezing**. Niets gaat verloren."

---

## Slide 5 — Live Demo (7 min)

**Salah:**

> "Tijd voor een live demo. Ik open onze GUI op `localhost:8089` (Bank 1) en `localhost:8090` (Bank 2) naast elkaar."

### Demo step 1: Manuele PO van Bank 1 → Bank 2

> "Ik maak een manuele PO aan in Bank 1:
> - **OA dropdown** — ik kies mijn eigen rekening, en zie meteen mijn saldo
> - **BB dropdown** — ik kies HOMNBEB1, ons andere bank
> - **BA IBAN** — een rekening van Bank 2
> - **Bedrag** — €50
>
> Ik klik 'Verstuur'. Direct verschijnt een **groene toast rechtsonder**: 'Manuele PO aangemaakt'."

### Demo step 2: Verwerk + zie de events

> "Klik op 'Verwerk PO_NEW'. Er gebeuren nu meerdere dingen tegelijk:
> - In **Bank 1 GUI**: PO_OUT tab krijgt een nieuwe rij, mijn saldo daalt met €50, transactions-tabel toont de debit
> - In **Bank 2 GUI** (na ~30s): toast popt op — 'Nieuwe inkomende PO verwerkt', PO_IN tab krijgt nieuwe rij, BA-saldo stijgt met €50
> - Terug in **Bank 1**: na nog ~30s — toast 'ACK ontvangen', po_out status wordt 'processed'"

### Demo step 3: Error scenario

> "Nu een PO met opzettelijke fout. Bedrag = €600 (boven de €500-limiet)."

```bash
curl -X POST http://localhost:8089/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{"oa_id":"BE13101000000020","ba_id":"BE99100200300001","bb_id":"HOMNBEB1","po_amount":600}'
```

> "Response: `{ok: false, code: 4002, message: 'Ongeldig bedrag'}`. Geen geld bewogen. Log-event geschreven met type `po_rejected`. Toast in GUI: 'PO geweigerd (4002)'."

### Demo step 4: Toon de Logs-tab

> "In de Logs-tab kan ik filteren op `po_rejected` — daar staat alle bewijs van afgewezen PO's. En ik kan filteren op `ack_pushed` — onze verstuurde ACK's."

### Demo step 5: Toon Railway live deployment

> "Tot slot, dit is geen lokaal-only systeem. **Beide banken draaien LIVE op Railway met HTTPS**:"

```bash
curl https://pingfin-team20-production.up.railway.app/api/info
curl https://pingfin-team20-bank2-production.up.railway.app/api/info
```

> "Auto-scaling, automatische restart-on-crash, 24/7 beschikbaar. De achtergrond-jobs draaien ook in productie."

---

## Slide 6 — Test resultaten (4 min)

**Abdallah:**

### 40 unit tests

> "Onze validatie-helpers worden gedekt door 40 unit tests, allemaal groen. Voorbeeld output:"

```
✅ BIC validation (8 of 11 chars, case-insensitive)
✅ IBAN validation (15-34 chars + mod-97 checksum)
✅ po_id format (BIC prefix, max 50 chars)
✅ po_amount validation (>0, ≤500, max 2 decimals)
✅ Alle 10 error codes correct gedefinieerd

RESULTAAT: 40 geslaagd / 0 gefaald
```

### 10 integration tests

> "Voor élke foutcode hebben we een integration test die opzettelijk een fout-PO POST'd en verifieert dat:
> 1. de juiste error-code in de response zit
> 2. een log-event geschreven werd
>
> Negatieve scenarios: bedrag te hoog (4002), negatief bedrag (4003), ongeldige BIC (4004), ongeldige IBAN (4101), missende Bearer (401), verkeerde Bearer (401), en een happy-path baseline."

### Live productie-statistieken

> "In de live test-fase hebben we:
> - **1066 ACK's** correct verstuurd naar de CB
> - **51 banken** geregistreerd in onze CB-cache
> - **5000+ log events** vastgelegd
> - **0 saldo-inconsistenties** dankzij atomische TX"

---

## Slide 7 — Difficulties & Lessons Learned (4 min)

**Abdallah:**

### Top moeilijkheden

> "We hebben deze week 6 grote bugs gehad — allemaal op dag 3 ontdekt tijdens cross-team tests:
>
> 1. **'OB krijgt geen ACK'** — silent failures in afgewezen PO's. Vier paden in onze code schreven niets terug naar de OB. Fix: een `persistRejection()` helper die élke afwijzing tracked.
>
> 2. **4101-storm** — onze IBAN-regex accepteerde alleen Belgische 16-char IBANs. Andere teams (NL, DE, FR) kregen massaal 4101's. Fix: regex naar 15-34 chars, internationaal IBAN-formaat.
>
> 3. **Hard-coded BIC fallback** — bij CB-onbereikbaarheid genereerden we PO's naar drie hard-coded BICs die niet meer geregistreerd waren. Wij veroorzaakten daardoor zelf 4004's. Fix: 503 fail-fast.
>
> 4. **CB-rejectie wachtte 1 uur** op de timeout-monitor in plaats van inline te refunden. Fix: directe refund bij codes 4002-4007.
>
> 5. **flushAckOut LEFT JOIN** dropte stilletjes rijen waar `po_in` ontbrak. Fix: fallback naar logs-snapshot.
>
> 6. **BIC case-sensitivity** — andere teams stuurden lowercase BICs. Wij rejecteerden. Fix: `.toUpperCase()` overal."

### Wat hebben we geleerd?

> "Vijf grote lessen:
>
> 1. **Test cross-team early.** We deden onze eerste integration met een andere bank pas op dag 3 — te laat. Vanaf dag 2 namiddag had ons veel tijd bespaard.
>
> 2. **Defensief valideren.** Andere systemen volgen niet altijd het protocol exact. Lowercase BICs, lange IBANs, ontbrekende velden — verwacht het en bouw tolerantie in.
>
> 3. **Geen silent failures.** `.catch(() => {})` is een trap — het verbergt bugs die je dan pas in productie ontdekt.
>
> 4. **Atomische transacties zijn niet optioneel** wanneer je geld verplaatst.
>
> 5. **Live observability** — toast notifications + auto-refresh in de GUI hebben onze laatste dag debug-tijd 10× versneld."

### Wat zouden we anders doen?

> "Voor een volgend project:
> - **CI/CD met automated tests** vanaf dag 1
> - **Vroege deployment** zodat anderen je kunnen pingen vanaf dag 2
> - **Geen project in OneDrive** — git is je sync, niet OneDrive (we hadden een uur sync-conflicten)
> - **Pair-programming** voor cross-functional kennis (frontend ↔ backend)"

---

## Slide 8 — Status & Q&A (3 min)

**Salah:**

### Eindstand

> "Alles wat de manual vroeg, is gerealiseerd:
> - ✅ Beide banken volledig functioneel
> - ✅ Alle 5 use cases gedekt
> - ✅ 5 background jobs draaien
> - ✅ 58 tests slagen
> - ✅ GUI met live updates
> - ✅ Beide banken live op Railway met HTTPS
> - ✅ 1066+ ACK's correct verstuurd
> - ✅ 4 dag-rapporten + volledig verslag"

> "Ons GitHub repo is publiek voor de coach: github.com/Salah-91/pingfin-team20. Live URLs staan in de README.

### Q&A

> "Vragen?"

---

## Demo-tips & contingencies

### Vóór de presentatie

- [ ] **Test 5 minuten ervoor** dat beide Railway-deploys live zijn (`curl /api/info` op beide)
- [ ] **Open beide GUIs** in tabs naast elkaar — zoom naar 90% zodat alles past
- [ ] **Open een terminal** met curl-commando's klaar (kopieer-plak vooraf)
- [ ] **Refresh ACK_OUT tab** zodat je de "1066 rijen" kan tonen
- [ ] **Heb screenshots klaar** voor het geval Railway flaky is

### Als demo faalt

> "Plan B: ik laat een vooraf opgenomen video zien" (de manual zegt expliciet dat dit toegestaan is, slide 34)

### Veelgestelde vragen — voorbereiden

| Vraag | Antwoord |
|---|---|
| "Hoe weet je dat de fix werkt?" | "1066 ACK_OUT rijen met `bb_code: 2000` — bewijst de happy path. 4 reject-paden geven nu allemaal ack_out met de error code, getest met 18 integration tests." |
| "Waarom geen TypeScript?" | "Tijdsdruk. We hadden 4 dagen. Voor scope deed Vanilla JS het sneller en de validatie zat al in pure functies." |
| "Hoe zit het met security?" | "Bearer tokens voor zowel inkomend als uitgaand verkeer. Secrets in `.env` files die git-ignored zijn — alleen de `.example` zijn in de repo." |
| "Wat als de DB volloopt?" | "Op productie zit Railway's auto-scaling MySQL. Voor onze test-load is dat ruim voldoende." |
| "Bedoel je met 'live' echt live?" | (Demo) `curl https://pingfin-team20-production.up.railway.app/api/info` → 200 OK |

---

## Tijd-check tijdens presentatie

| Tijd | Waar zou je moeten zijn? |
|---|---|
| 3 min | Klaar met probleemstelling |
| 5 min | Klaar met architectuur |
| 10 min | Klaar met code highlights |
| 17 min | Klaar met demo |
| 21 min | Klaar met test resultaten |
| 25 min | Klaar met difficulties |
| 27 min | Status overview |
| 30 min | Einde Q&A |

Als je achter ligt: **demo inkorten** (skip de error-scenario, alleen happy path tonen). Als je voor ligt: **meer Q&A**.
