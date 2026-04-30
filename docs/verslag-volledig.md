# PingFin — Verslag Bank Team 20

> **Workshop SEPA payments simulation**
> Odisee — 27-30 april 2026
> **Team 20:** Salaheddine Sennouni · Abdallah Azouagh · Ayoub Abdeddoun · Marwan Saidi
> **Banken:** CEKVBE88 (Bank 1) & HOMNBEB1 (Bank 2)
> **Coach:** Rogier van der Linde · Polina Kozlova

---

## Inhoudsopgave

1. [Inleiding](#1-inleiding)
2. [Communicatie tussen GUI en API](#2-communicatie-tussen-gui-en-api)
3. [Databankstructuur](#3-databankstructuur)
4. [Documentatie van de API](#4-documentatie-van-de-api)
5. [Flow van een Payment Order](#5-flow-van-een-payment-order)
6. [Beschrijving plan van aanpak](#6-beschrijving-plan-van-aanpak)
7. [Werkverdeling en planning](#7-werkverdeling-en-planning)
8. [Problemen en oplossingen](#8-problemen-en-oplossingen)
9. [Handleiding voor gebruik van de GUI](#9-handleiding-voor-gebruik-van-de-gui)
10. [Reflectie](#10-reflectie)
11. [Bijlagen](#11-bijlagen)

---

## 1. Inleiding

### 1.1 Beschrijving van het project

PingFin is een vereenvoudigde simulatie van het **SEPA betalingssysteem** binnen de Single Euro Payments Area. Elke deelnemende studententeam bouwt ofwel een gewone bank (Originating Bank / Beneficiary Bank), ofwel de Clearing Bank in het midden. Ons team 20 heeft **twee gewone banken** geïmplementeerd: `CEKVBE88` (Bank 1) en `HOMNBEB1` (Bank 2). Beide banken kunnen zowel als verzendende als ontvangende bank fungeren.

### 1.2 Doel van het project

Bouwen van een werkend, **veerkrachtig en veilig** payment-systeem dat:
- Payment Orders kan genereren, valideren en doorsturen via een gedeelde Clearing Bank
- ACK's (acknowledgements) kan ontvangen en correct kan verwerken
- Foutgevallen (onbekende account, bedrag te hoog, BB onbereikbaar, timeout) zelfstandig kan afhandelen
- Een gebruiksvriendelijke GUI biedt voor monitoring en interactie
- Communicatie tussen meerdere bank-teams ondersteunt via de centrale CB

### 1.3 Schema van de opbouw van het project

```
┌──────────────────────────────────────────────────────────────────┐
│  Team 20 PingFin Stack                                           │
│                                                                  │
│  ┌────────────────┐         ┌────────────────┐                  │
│  │  GUI (Bank 1)  │         │  GUI (Bank 2)  │                  │
│  │  port 8089     │         │  port 8090     │                  │
│  │  HTML/CSS/JS   │         │  HTML/CSS/JS   │                  │
│  └────────┬───────┘         └────────┬───────┘                  │
│           │ /api/*                   │ /api/*                    │
│           ▼                          ▼                           │
│  ┌────────────────┐         ┌────────────────┐                  │
│  │ Express API    │         │ Express API    │                  │
│  │ (Node.js 20)   │         │ (Node.js 20)   │                  │
│  │                │         │                │                  │
│  │ • routes/      │         │ • routes/      │                  │
│  │ • services/    │         │ • services/    │                  │
│  │ • lib/validate │         │ • lib/validate │                  │
│  │ • jobs/ × 5    │         │ • jobs/ × 5    │                  │
│  └────────┬───────┘         └────────┬───────┘                  │
│           │                          │                           │
│           ▼                          ▼                           │
│  ┌────────────────┐         ┌────────────────┐                  │
│  │ pingfin_b1     │         │ pingfin_b2     │                  │
│  │ (MySQL 8)      │         │ (MySQL 8)      │                  │
│  └────────────────┘         └────────────────┘                  │
│           │                          │                           │
└───────────┼──────────────────────────┼───────────────────────────┘
            │                          │
            └─────── stevenop.be ──────┘
                  (CB API v2 — extern)
```

**Drie deployment-modi:**
1. **Lokaal docker-compose** vanuit project root → beide banken samen op één db
2. **Per-bank compose** (`Bank 1/docker-compose.yml`) → één bank standalone
3. **Railway productie** → live HTTPS endpoints, 24/7 beschikbaar

---

## 2. Communicatie tussen GUI en API

### 2.1 Tech stack

| Laag | Keuze | Reden |
|---|---|---|
| **Frontend** | Vanilla HTML5 + CSS3 + JS (geen framework) | beperkte tijd, geen bundler complexity |
| **API** | Express 4 op Node.js 20 | mature ecosystem, async/await first-class |
| **HTTP** | Fetch API (browser) + node-fetch (server) | uniforme interface |
| **Format** | JSON | manual-conform |
| **Auth** | Bearer tokens | manual-conform |

### 2.2 Request format (manual-conform)

```js
const requestOptions = {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ghp_fIWhq1DrL...',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ data: [PO1, PO2, PO3, ...] }),
};
```

### 2.3 Response format (manual-conform)

```js
{
  ok: true,                    // boolean
  status: 200,                 // HTTP status
  code: null,                  // pingfin error code of null
  message: null,               // detail message
  data: [...]                  // array of objects
}
```

### 2.4 Live data-flow GUI → API

De GUI gebruikt **auto-polling** (elke 10s) i.p.v. manuele refreshes:

1. JS leest snapshot van po_in / po_out / ack_in / ack_out / accounts
2. Vergelijkt met vorige snapshot (diff-detectie)
3. Toont **toast notification** rechtsonder bij elke nieuwe rij of statuswijziging
4. Update de zichtbare tabel in-place

Resultaat: gebruiker ziet **realtime feedback** op wat er gebeurt zonder zelf te moeten klikken.

---

## 3. Databankstructuur

### 3.1 Schema overview

| Tabel | Rol | Aantal kolommen |
|---|---|---|
| `accounts` | rekeningen + saldo | 4 |
| `po_new` | te verwerken PO's (ingang) | 9 |
| `po_out` | uitgaande PO's wij = OB | 16 |
| `po_in` | inkomende PO's wij = BB | 15 |
| `ack_in` | ontvangen ACK's | 7 |
| `ack_out` | te versturen ACK's + retry-vlag | 6 |
| `transactions` | audit-trail per saldobeweging | 7 |
| `logs` | event-log met PO-snapshot per regel | 17 |

### 3.2 Belangrijke ontwerp-keuzes

**Atomische transacties:**
Elke betaling die geld beweegt is gewikkeld in een DB-transactie die alle 4 schrijf-acties bundelt:
1. `UPDATE accounts SET balance` (debit/credit)
2. `INSERT INTO po_in/po_out`
3. `INSERT INTO transactions` (audit)
4. `INSERT INTO ack_out` (uitgaand bericht)

Als één faalt → rollback van álles. Geen half-verwerkte staat mogelijk.

**Transactions-tabel met signed amount:**
- BA (creditzijde) krijgt positief bedrag
- OA (debetzijde) krijgt negatief bedrag
- `isvalid` + `iscomplete` flags conform manual

**Logs-tabel met volledige PO-snapshot:**
Elk log-event bevat alle 14 PO-velden (po_id, po_amount, ob_id, ...) als kolommen. Audit-queries kunnen dus zonder JOIN het volledige PO-bericht reproduceren op het moment van het event.

### 3.3 Pre-loaded data

Beide banken starten met **20 rekeningen × €5000** = €100.000 per bank. IBANs zijn handmatig gegenereerd met geldige mod-97 checksum.

Zie [`pingfin_database.sql`](../pingfin_database.sql) voor het volledige schema + initial accounts.

---

## 4. Documentatie van de API

### 4.1 Endpoint-lijst (manual-conform + extra's)

#### Public endpoints (per manual)

| Methode | URL | Auth | Body | Beschrijving |
|---|---|---|---|---|
| GET | `/api/help` | — | — | overzicht endpoints |
| GET | `/api/info` | — | — | team info, BIC, name |
| GET | `/api/accounts` | — | — | lijst rekeningen |
| GET | `/api/banks` | — | — | cache van CB.banks |
| POST | `/api/po_in` | **Bearer** | `{data: [PO]}` | inkomende PO van CB |
| POST | `/api/ack_in` | **Bearer** | `{data: [ACK]}` | inkomende ACK van CB |

#### Internal endpoints (eigen design)

| Methode | URL | Wat |
|---|---|---|
| GET | `/api/po_new/generate?count=N` | genereer N willekeurige PO's |
| POST | `/api/po_new/add` | voeg lijst toe aan po_new |
| POST | `/api/po_new/manual` | manuele single PO via formulier |
| GET | `/api/po_new/process` | verwerk alle pending po_new |
| GET | `/api/po_out` / `/api/po_in` | lees uitgaande/inkomende PO's |
| GET | `/api/ack_out` / `/api/ack_in` | lees verzonden/ontvangen ACK's |
| GET | `/api/transactions` | audit-trail saldobewegingen |
| GET | `/api/logs?type=&limit=` | event-logs met optionele filter |
| GET | `/api/jobs/run/:name` | manuele job-trigger (demo) |

### 4.2 Authenticatie

**Inkomend (wij worden aangeroepen):**
`Authorization: Bearer <INCOMING_TOKEN>` — vergelijkt met env-variabele.

**Uitgaand (wij roepen CB aan):**
Token wordt opgehaald via `POST /token` met `{bic, secret_key}`. TTL = 4 uur, refresh op 3.5 uur via achtergrond-job.

### 4.3 Postman-voorbeeld

```bash
# 1. Health check
curl https://pingfin-team20-production.up.railway.app/api/info

# 2. Manueel een PO indienen
curl -X POST https://pingfin-team20-production.up.railway.app/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{
    "oa_id": "BE13101000000020",
    "ba_id": "BE99100200300001",
    "bb_id": "HOMNBEB1",
    "po_amount": 50,
    "po_message": "Test betaling"
  }'

# 3. Verwerk po_new
curl https://pingfin-team20-production.up.railway.app/api/po_new/process

# 4. Bekijk PO_OUT
curl https://pingfin-team20-production.up.railway.app/api/po_out
```

Volledige API documentatie: [`docs/api.md`](api.md).

### 4.4 Foutcodes

| Code | Naam | Bron | Wanneer |
|------|------|------|---------|
| 2000 | OK | OB/CB/BB | succesvolle verwerking |
| 4001 | INTERNAL_TX | OB | interne PO foutief naar CB gestuurd |
| 4002 | AMOUNT_EXCEEDED | OB/CB | bedrag > €500 |
| 4003 | AMOUNT_INVALID | OB/CB | bedrag ≤ 0 |
| 4004 | BB_UNKNOWN | CB/BB | ontvangende BIC niet bekend |
| 4005 | DUPLICATE_PO | CB/BB | po_id reeds verwerkt |
| 4006 | OB_MISMATCH | OB/BB | po_id-prefix klopt niet |
| 4007 | DUP_IN_BATCH | CB | dezelfde po_id 2× in 1 batch |
| 4101 | ACCOUNT_UNKNOWN | BB | OA/BA bestaat niet of ongeldige IBAN |
| 4102 | INSUFFICIENT_BALANCE | OB | OA-saldo < bedrag |

---

## 5. Flow van een Payment Order

### 5.1 Flowchart

```
[BANK A = OB]                  [CLEARING BANK]                  [BANK B = BB]
─────────────                  ───────────────                  ─────────────

PO_NEW
   │
   ▼
processPoNew()
   │ valideer:
   │ - po_id format?
   │ - BIC/IBAN?
   │ - bedrag?
   │ - OA bestaat?
   │ - saldo?
   │
   ├──────► [reject] → log + delete po_new + bb_code 4xxx
   │
   ▼ (intern?)
   ├─ ja  → atomic TX (debit OA + credit BA)
   │       insert tx + delete po_new
   │
   ▼ (extern)
DEBIT OA
INSERT po_out (status=pending)
   │
   │ POST /po_in {data: [PO]}
   │ ─────────────────────────────────►
   │                                CB.po_in
   │                                   │
   │                                   ▼
   │                         CB validate (4002-4007)
   │                                   │
   │ ◄── cb_code 4xxx ──────────────── │  rejected
   │   inline refund OA                │
   │   status=failed                   │
   │                                   ▼ accepted
   │                                CB.po_out
   │                                                     pollPoOut()
   │                                                     elke 30s
   │                                   ◄────────────── GET /po_out
   │                                                       │
   │                                                       ▼
   │                                                 processPoIn()
   │                                                  - bb_id == ours?
   │                                                  - po_id format?
   │                                                  - amount?
   │                                                  - ba_id?
   │                                                       │
   │                                                  [reject] → ack_out
   │                                                       │   bb_code 4xxx
   │                                                       ▼
   │                                                  CREDIT BA
   │                                                  insert po_in + tx
   │                                                  insert ack_out
   │                                                       │
   │                                                       │ POST /ack_in
   │                                   ◄────────────────── │
   │                                CB.ack_in
   │                                   │
   │                                   ▼
   │                                CB.ack_out
   │ ◄────────── GET /ack_out
   │ pollAckOut()
   │ elke 30s
   │
   ▼
processAckIn()
 - bb_code 2000? → status=processed, mark tx complete
 - bb_code 4xxx? → refund OA, status=failed
                                                  ──────────────────────►
                                                  TIMEOUT MONITOR
                                                  elke 5min — als po_out
                                                  > 1u oud zonder ACK:
                                                  refund OA, status=timeout
```

### 5.2 Stappen in detail

1. **PO ingevoerd** via GUI (manueel) of generator → `po_new`
2. **`/po_new/process`** triggert `processPoNew()` voor elke rij
3. **Validatie** via 7 guard-clauses (zie sectie 8 voor lijst)
4. **Intern of extern** beslissing op basis van `bb_id`
5. **Externe betaling**: debit OA + insert po_out + POST naar CB
6. **CB-respons** wordt inline verwerkt; bij 4xxx-code → refund + status=failed
7. **Andere bank ontvangt** via push of poll → processPoIn → credit BA + ack_out
8. **ACK terug naar CB** via direct push of flushAckOut retry-job
9. **Originele bank pollt CB.ack_out** → processAckIn → status update + eventuele refund

---

## 6. Beschrijving plan van aanpak

| Dag | Focus | Belangrijkste deliverables |
|---|---|---|
| **Dag 1** | Analyse + planning + design | Repo, Trello, visuele model, DB-scheme, Postman simulatie |
| **Dag 2** | Implementatie | API endpoints, validatie helpers, GUI mockups, eerste E2E test |
| **Dag 3** | Validation, testing, deployment | 6 bug-fixes, test-suite, GUI v2 met live notifications, Railway live |
| **Dag 4** | Presentatie + reflectie | Slide deck, verslag afgewerkt, retrospectie |

**Volledige dag-rapporten:**
- [`dag1.md`](dag1.md) — Analyse & Planning
- [`dag2.md`](dag2.md) — Implementatie
- [`dag3.md`](dag3.md) — Validation, Testing & Deployment
- [`dag4.md`](dag4.md) — Presentatie & Reflectie

---

## 7. Werkverdeling en planning

| Lid | Hoofdverantwoordelijkheid |
|---|---|
| **Salaheddine Sennouni** | Backend-architectuur, API endpoints, jobs, security, deployment |
| **Abdallah Azouagh** | Project management (Trello), cross-team integration, rapport |
| **Ayoub Abdeddoun** | Database design, validatie-regels, foutcode-mapping |
| **Marwan Saidi** | GUI (HTML/CSS/JS), live notifications, screenshots |

**Project management tool:** Trello met kaarten per category (Validation, Test, GUI, Error List, Test & Run, End).

**Stand-ups:** dagelijks 09:00 — wat heb je gisteren gedaan, wat ga je vandaag doen, blockers?

**Communicatie:** Discord voor sync chat, GitHub PRs voor code review.

---

## 8. Problemen en oplossingen

### 8.1 Top-6 bugs van de week (alle gefixt in commit `cf5216d`)

| # | Probleem | Oplossing |
|---|---|---|
| 1 | "OB krijgt geen ACK" — silent failures in reject-paden | `persistRejection()` helper in [`poInService.js`](../Bank%201/services/poInService.js) |
| 2 | `flushAckOut` LEFT JOIN dropte rijen waar po_in ontbrak | fallback naar logs-snapshot in [`flushAckOut.js`](../Bank%201/jobs/flushAckOut.js) |
| 3 | IBAN-regex te strikt (alleen BE 16 chars) → 4101-storm | regex naar 15-34 chars in [`validate.js`](../Bank%201/lib/validate.js) |
| 4 | BIC vergelijking case-sensitive → onjuiste OB_MISMATCH | `.toUpperCase()` overal |
| 5 | CB-rejectie 4xxx wachtte 1u op timeout-monitor | inline refund in [`poProcessor.js`](../Bank%201/services/poProcessor.js) |
| 6 | Hard-coded BIC fallback genereerde 4004's | 503 fail-fast in [`routes/po.js`](../Bank%201/routes/po.js) |

### 8.2 Andere uitdagingen

| Uitdaging | Hoe aangepakt |
|---|---|
| **OneDrive sync vs git** — folders die we deleten worden teruggezet vanuit cloud | `**/.env` toegevoegd aan `.gitignore`, OneDrive sync gepauzeerd voor de repo-folder |
| **Strict cross-team protocol** — andere teams stuurden lowercase BICs, lange IBANs | defensief: case-insensitive vergelijken, internationale IBAN-formaat ondersteunen |
| **CB-token verloopt halverwege test** | refresh-job op 3.5h (TTL 4h) |
| **mysql2 LIMIT placeholder** werkt niet | string-interpolatie i.p.v. `?` voor LIMIT |
| **Decimal-velden komen als string** | `decimalNumbers: true` in pool config |
| **Tijd-druk dag 4** — bug-fixes liepen door | last-minute refactor, getest met test-suite zodat we niets braken |

---

## 9. Handleiding voor gebruik van de GUI

### 9.1 GUI Functionaliteiten

**Dashboard tab** (📊):
- 6 statistieken-kaarten: aantal accounts, po_out, po_in, ack_in, transactions, logs
- Bank info-blok met BIC + team-leden
- Quick Actions panel: 5 knoppen voor manuele job-triggers (BB-poller, OB-poller, flush, timeout, token-refresh)
- Job-log paneel met realtime feedback

**Accounts tab** (💳):
- Tabel met alle 20 rekeningen
- IBAN, eigenaar, saldo (met euro-formatting)

**PO Aanmaken tab** (➕):
- **Generator** — slider voor aantal (1-20), genereer + opslaan + verwerk knoppen
- **Manuele PO formulier** met:
  - **OA dropdown** — alle eigen accounts met saldo zichtbaar
  - **BB dropdown** — eigen BIC bovenaan (interne PO) + alle externe banken uit CB.banks
  - **BA datalist** — suggesties van eigen IBANs voor interne overschrijving
  - Bedrag + bericht input
  - Inline-validatie met directe toast-feedback

**PO_OUT / PO_IN / ACK_IN / ACK_OUT tabs:**
- Tabellen met realtime auto-refresh elke 10 seconden
- Kleurgecodeerde badges (groen=OK, rood=fout, geel=pending)
- Datum-formatting met locale `nl-BE`

**Transacties tab** (💱):
- Audit-trail met +/- bedragen, valid/complete vlaggen
- Per saldobeweging één rij

**Logs tab** (📜):
- Filter op event-type (po_rejected, ba_credited, ack_pushed, ...)
- Limiet 10-1000 rijen
- Volledige PO-snapshot in elke regel

**Banks tab** (🏛️):
- Lijst van alle 51 banken geregistreerd bij de CB
- Onze eigen BIC gehighlight

### 9.2 Live notification systeem

- **Toast notifications rechtsonder** bij elke nieuwe inkomende PO, ACK, of saldowijziging
- **Live indicator linksonder**: groene puls = poll OK, rood = API onbereikbaar
- **Pulsende dot op nav-knop** als er nieuwe events zijn in een tab → klik om te lezen

### 9.3 Bank-selector

Rechtsboven in de header staat een dropdown waarmee je tussen Bank 1 en Bank 2 kan wisselen zonder herladen.

### 9.4 Live URLs

- **Bank 1**: https://pingfin-team20-production.up.railway.app
- **Bank 2**: https://pingfin-team20-bank2-production.up.railway.app

Beide draaien 24/7 met HTTPS.

---

## 10. Reflectie

### 10.1 Wat is gerealiseerd?

✅ Beide banken volledig functioneel — verzenden + ontvangen
✅ Alle 5 use cases uit de manual gedekt
✅ 5 achtergrond-jobs: poll-po-out, poll-ack-out, flush-ack-out, timeout-monitor, cb-token-refresh
✅ 40 unit tests + 18 integration tests, allemaal groen
✅ GUI met live updates, toast notifications, slimme dropdowns
✅ Beide banken live op Railway met HTTPS
✅ 1066+ ACK's correct verwerkt = bewijs van werkende BB-flow
✅ Per-bank Docker-folder structuur conform coach-eisen
✅ 4 dag-rapporten + test-rapport + geld-flow + verslag

### 10.2 Geleerde lessen

1. **Test cross-team early** — wachten tot dag 3 was te laat
2. **Defensief valideren** — andere systemen volgen niet altijd het protocol
3. **Geen silent failures** — élke catch moet loggen
4. **Atomische TX bij geld** is niet optioneel
5. **Live observability** > "ik kijk wel achteraf in de logs"
6. **Single source of truth** voor codes en validatie
7. **Schoolprojecten in OneDrive** is een slecht idee — gebruik git

### 10.3 Verbeterpunten voor toekomst

- **CI/CD met automated tests** bij elke push (GitHub Actions)
- **Day 1 namiddag al deployed** zodat anderen kunnen pingen vanaf dag 2
- **Project lokaal**, niet in OneDrive
- **API-versionering** vanaf het begin (`/api/v1/`)
- **Contract tests** met de CB API om verschillen tussen teams op te sporen

### 10.4 Wat zouden we anders aanpakken?

- Vroeger met andere teams testen (dag 2 i.p.v. dag 3)
- Meer pair-programming voor cross-functional kennis (frontend ↔ backend)
- Trello board strikter bijhouden — sommige kaarten bleven in `pending` ondanks afgewerkte code
- Dagelijks een mini-rapport schrijven in plaats van alles op het einde

---

## 11. Bijlagen

### 11.1 Repository structuur

```
pingfin-team20/
├── Bank 1/                       # CEKVBE88 — port 8089
│   ├── server.js
│   ├── routes/   services/   lib/   jobs/   middleware/
│   ├── tests/    (validate.test.js, error-pos.test.js)
│   ├── public/   (GUI: index.html, css/, js/)
│   ├── Dockerfile + docker-compose.yml
│   └── .env (git-ignored)
├── Bank 2/                       # HOMNBEB1 — port 8090
│   └── (identiek)
├── pingfin_database.sql          # initiële DB met schema + accounts
├── docker-compose.yml            # root: db + beide banken
├── docs/
│   ├── verslag-volledig.md       # dit document
│   ├── dag1.md ... dag4.md       # dag-rapporten
│   ├── api.md                    # API documentatie
│   ├── geld-flow.md              # wanneer geld stort/refund
│   ├── test-rapport.md           # test bewijslast
│   └── presentatie-script.md     # presentatie tekst
└── README.md
```

### 11.2 Belangrijke code-fragmenten

**Atomische TX (services/poInService.js):**
```js
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, ba_id]);
  await conn.query('INSERT INTO po_in ...');
  await conn.query('INSERT INTO transactions ...');
  await conn.query('INSERT INTO ack_out ...');
  await conn.commit();
} catch (err) {
  await conn.rollback();
  await persistRejection(po, C.ACCOUNT_UNKNOWN, ts, snapshot);
}
```

**Validatie (lib/validate.js):**
```js
const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i;

function amountErrorCode(amount) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) return C.AMOUNT_INVALID;   // 4003
  if (n > 500) return C.AMOUNT_EXCEEDED;                         // 4002
  return null;
}
```

**Bearer-auth middleware (middleware/auth.js):**
```js
function requireBearer(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/);
  if (!m || m[1] !== cfg.incomingToken) {
    return res.status(401).json({ ok: false, status: 401, message: 'Ongeldig of ontbrekend Bearer-token' });
  }
  next();
}
```

### 11.3 Gerelateerde documenten

- [Test bewijslast met curl-commando's](test-rapport.md)
- [Geld-flow per use case](geld-flow.md)
- [API endpoint documentatie](api.md)
- [Presentatie-script](presentatie-script.md)

### 11.4 GitHub & live

- **Repo (public):** https://github.com/Salah-91/pingfin-team20
- **Trello bord:** https://trello.com/invite/b/69ef187a4cf9b500a97c20a3/...
- **Bank 1 live:** https://pingfin-team20-production.up.railway.app
- **Bank 2 live:** https://pingfin-team20-bank2-production.up.railway.app
- **CB API:** https://stevenop.be/pingfin/api/v2/
