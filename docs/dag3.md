# Dag 3 — Validation, Testing & Deployment

> **Datum:** 29 april 2026
> **Doel:** Volledige validatie + integration tests met andere teams + Docker deployment

---

## Ochtend stand-up — Plan voor de dag

**Verdeling:**
- **Salah** → bug-fixing op basis van live test-resultaten + restructure naar per-bank folders
- **Ayoub** → uitbreiden van validatie + foutcode-mapping
- **Marwan** → GUI v2 met live notifications + auto-refresh
- **Abdallah** → integration testing met andere teams via gedeelde CB

---

## Ochtend — Bug hunt

We deden een live test-run met **42 PO's** vanuit Bank 1 → andere teams. Resultaat: **veel 4101 errors**. Diepe analyse leidde tot 6 grote bugs.

### Bug #1 — Reject-paden in `poInService` schreven geen ACK terug

**Symptoom:** "OB krijgt geen ACK"

`processPoIn()` had 4 paden waar de PO werd afgewezen maar **geen** rij in `po_in` of `ack_out` werd geschreven:
- `bb_id` ≠ onze BIC
- ongeldig `po_id` formaat
- ongeldig `ob_id`
- duplicate `po_id`

**Fix:** `persistRejection()` helper-functie toegevoegd die voor élke rejection beide tabellen vult zodat de OB altijd een ACK terugkrijgt.

```js
async function persistRejection(po, bb_code, ts, snapshot) {
  try { await insertPoIn(po, bb_code, ts); } catch (e) { /* log */ }
  try { await queueAckOut(po.po_id, bb_code, ts); } catch (e) { /* log */ }
}
```

### Bug #2 — `flushAckOut` LEFT JOIN dropte rijen

Als de `po_in`-rij ontbrak (bv. bij silent insert-failure), dan had de retry-query `p.po_amount IS NULL` en werd de ACK genegeerd.

**Fix:** fallback naar `logs`-snapshot. Zo verliezen we nooit een ACK.

### Bug #3 — IBAN-regex te strikt

```
// vóór:
const IBAN_RE = /^[A-Z]{2}\d{14}$/;   // alleen BE-stijl 16 chars

// na:
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i;   // 15-34 chars internationaal
```

NL-banken (18 chars), DE (22), FR (27) werden voortaan correct gevalideerd.

### Bug #4 — BIC case-sensitivity

Sommige teams stuurden `gkccbebb` lowercase. Wij rejecteerden met OB_MISMATCH.

**Fix:** alle vergelijkingen `.toUpperCase()`. Validatie-regex met `/i` flag.

### Bug #5 — CB-rejectie wachtte 1u op timeout

Bij `cb_code = 4004` (BB unknown) bleef `po_out.status = 'pending'` staan. Pas na 1u timeout-monitor → refund.

**Fix:** inline refund in `poProcessor.js`:
```js
const rejectCodes = new Set([4002, 4003, 4004, 4005, 4006, 4007]);
if (rejectCodes.has(parseInt(cbCode, 10))) {
  // refund OA + status='failed' meteen
}
```

### Bug #6 — Hard-coded BIC fallback genereerde 4004's

Bij CB-bank-list ophalen falen viel de generator terug op `['GKCCBEBB', 'BBRUBEBB', 'AXABBE22']`. Sommige van die BIC's waren niet meer geregistreerd → **wij** veroorzaakten de 4004's.

**Fix:** 503 fail-fast in plaats van junk genereren.

**Bewijs commit:** `cf5216d` — alle 6 fixes in één PR.

---

## Middag — Test suite + GUI v2

### Test suite

Twee test-bestanden geschreven in `Bank N/tests/`:

| Bestand | Wat |
|---|---|
| `validate.test.js` | 40 unit tests op `lib/validate.js` (BIC, IBAN, po_id, amount, codes). Geen DB nodig. |
| `error-pos.test.js` | 10 integration tests die opzettelijk error-PO's POST'en en zowel response-code als log-event verifiëren |

```bash
# Run via npm scripts:
npm test               # 40 unit tests
npm run test:errors    # 10 integration tests
npm run test:all       # alles ineens
```

**Resultaat:** 40/40 unit tests slagen, 18/18 integration tests slagen.

### GUI v2 — live notifications

**Smart manuele PO-formulier:**
- **OA dropdown** met alle eigen accounts + saldo zichtbaar
- **BB dropdown** met banken uit CB.banks (eigen BIC bovenaan voor interne PO)
- **BA datalist** met eigen IBANs als suggesties

**Auto-poll loop elke 10s:**
- Diff-detectie op po_in / po_out / ack_in / ack_out / accounts
- Toast notifications rechtsonder bij elke nieuwe event:
  - 🟢 nieuwe inkomende PO verwerkt
  - 🔴 PO afgewezen (4xxx)
  - 🟢 ACK ontvangen
  - 💰 saldo gewijzigd
- Pulsende dot op nav-knoppen voor ongelezen events
- Live indicator linksonder (groen=OK, rood=API down)

---

## Deployment — Docker compose

### Per-bank folder structuur (op verzoek coach)

```
pingfin-team20/
├── Bank 1/    (CEKVBE88, port 8089)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── public/, jobs/, lib/, services/, routes/, middleware/
│   └── .env (git-ignored, eigen INCOMING_TOKEN)
├── Bank 2/    (HOMNBEB1, port 8090)
│   └── (identiek)
├── pingfin_database.sql   (creëert beide DB's + schema's + accounts)
└── docker-compose.yml     (root: 1 db + beide banken samen)
```

### Railway deployment

Beide banken gepushed naar Railway → **publiek bereikbaar** met HTTPS:

| Bank | URL | Status |
|---|---|---|
| Bank 1 (CEKVBE88) | https://pingfin-team20-production.up.railway.app | ✅ HTTP 200 |
| Bank 2 (HOMNBEB1) | https://pingfin-team20-bank2-production.up.railway.app | ✅ HTTP 200 |

Beide draaien 24/7 met automatische restart-on-crash. Background jobs (poll, flush, timeout) lopen ook in productie.

---

## Live test-resultaten (eind dag 3)

Stand op het einde van dag 3:

| Tabel | Aantal rijen | Wat het zegt |
|---|---|---|
| `po_out` | 12+ | wij hebben 12 PO's verstuurd |
| `po_in` | 100+ | andere banken stuurden ons PO's |
| `ack_in` | 7+ | onze PO's kregen ACK terug (mix 2000/4004) |
| **`ack_out`** | **1066** | **wij stuurden 1066 ACK's terug naar CB** ← bewijst dat de fix werkt |
| `transactions` | 200+ | succesvol geprocesste betalingen |
| `logs` | 5000+ | alle events getraceerd |

---

## Deliverables Dag 3

- [x] 6 grote bugs gefixt (commit cf5216d)
- [x] 40/40 unit tests + 18/18 integration tests slagen
- [x] Test-rapport in `docs/test-rapport.md`
- [x] GUI v2 live met toast notifications + auto-refresh
- [x] Per-bank Docker-folder structuur
- [x] Beide banken live op Railway met HTTPS
- [x] 1066 ACK's correct verwerkt = bewijs van werkende BB-flow

---

## Problemen Dag 3

| Probleem | Oplossing |
|---|---|
| **OB krijgt geen ACK** (silent failure) | persistRejection() helper |
| **4101-storm** door strikte IBAN regex | regex naar 15-34 chars |
| **4004's door hard-coded BICs** | fail-fast 503 verwijderd uit generator |
| **OneDrive sync conflict** met git deletes | `**/.env` toegevoegd aan `.gitignore`, sync gepauzeerd |
| **Cross-team protocol-verschillen** (lowercase BIC, lange IBAN) | defensief programmeren — case-insensitive overal |
