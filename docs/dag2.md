# Dag 2 — Implementatie

> **Datum:** 28 april 2026
> **Doel:** Werkende API + GUI mockups + eerste end-to-end test

---

## Ochtend stand-up — Plan voor de dag

**Verdeling:**
- **Salah** → API endpoints + database queries + jobs
- **Ayoub** → validatie-helpers (BIC, IBAN, amount, po_id)
- **Marwan** → GUI mockups in Pencil + statische HTML/CSS
- **Abdallah** → Postman-collection bouwen voor team-tests + Trello updates

---

## Ochtend — API design

**Endpoints geïmplementeerd** (naast de manual-vereisten):

### Public (manual-conform)
| Methode | URL | Wat |
|---|---|---|
| GET | `/api/help` | overview met links |
| GET | `/api/info` | team + bank-info |
| GET | `/api/accounts` | alle accounts |
| GET | `/api/banks` | cache van CB.banks |
| POST | `/api/po_in` (Bearer) | inkomende PO van CB |
| POST | `/api/ack_in` (Bearer) | inkomende ACK van CB |

### Internal (eigen endpoints)
| Methode | URL | Wat |
|---|---|---|
| GET | `/api/po_new/generate?count=N` | genereer N willekeurige PO's |
| POST | `/api/po_new/add` | voeg PO's toe aan `po_new` |
| POST | `/api/po_new/manual` | manuele PO via formulier |
| GET | `/api/po_new/process` | verwerk alle pending `po_new` |
| GET | `/api/po_out` | lees uitgaande PO's |
| GET | `/api/po_in` | lees inkomende PO's |
| GET | `/api/ack_in` | lees ontvangen ACK's |
| GET | `/api/ack_out` | lees verstuurde ACK's |
| GET | `/api/transactions` | audit-trail saldobewegingen |
| GET | `/api/logs?type=&limit=` | event-logs met filter |
| GET | `/api/jobs/run/:name` | manuele job-trigger (demo) |

### Background jobs
4 achtergrond-processen die zelfstandig blijven draaien:

1. **`pollPoOut`** — elke 30s, haalt nieuwe PO's voor onze BIC uit CB.po_out
2. **`pollAckOut`** — elke 30s, haalt ACK's voor onze verstuurde PO's uit CB.ack_out
3. **`flushAckOut`** — elke 60s, retry-job voor ACK's die niet meteen door CB werden geaccepteerd
4. **`timeoutMonitor`** — elke 5min, scant `po_out` ouder dan 1u zonder ACK → refund OA

5. **`cbToken`** — fetch token bij startup + refresh elke 3.5h (voor het 4h verloopt)

---

## Middag — Database queries + eerste tests

### Atomische transacties

Voor elke geld-beweging gebruiken we `pool.getConnection()` + `beginTransaction()`:

```js
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', ...);
  await conn.query('INSERT INTO po_out ...');
  await conn.query('INSERT INTO transactions ...');
  await conn.commit();
} catch (err) {
  await conn.rollback();
  // alles wordt teruggedraaid → geen half-verwerkte PO mogelijk
}
```

### Eerste end-to-end test

Met Postman:
1. POST `/api/po_new/manual` → 1 PO van OA → BA, intern → status COMPLETED, saldo's correct gewijzigd
2. POST `/api/po_new/manual` → 1 PO van OA → andere bank, extern → po_out met status pending
3. Wachten 30s → BB-poller picks up → ack_out → BB stuurt naar CB.ack_in
4. Wachten 30s → OB-poller picks up → ack_in → status processed

**Eerste 10 PO's gegenereerd via `GET /api/po_new/generate?count=10`** en getest. Werkt!

---

## Bouwen van de GUI

### Mockups (Marwan)

Schetsen gemaakt voor:
- Dashboard met statistieken-kaarten
- Tabbladen voor PO_OUT, PO_IN, ACK_IN, ACK_OUT
- Quick Actions panel voor manual job-triggers
- Manuele PO-formulier in expandable details-element

### HTML/CSS implementatie

8 CSS-bestanden met **single responsibility**:
- `base.css` — color tokens (CSS variables)
- `layout.css` — pagina-grid + sticky header/footer
- `componenten.css` — kaarten, knoppen, badges
- `tabellen.css` — table styling
- `formulieren.css` — input/select/details
- `index.css` — dashboard-specifiek
- `start.css` — loading/empty states
- `common.css` — utilities

Donker thema gekozen (zwart-blauw) voor moderne look + minder oog-belasting tijdens demos.

---

## Deliverables Dag 2

- [x] API documentatie in `docs/api.md` met endpoint-tabellen + voorbeelden
- [x] GUI mockups (eerste statische versie)
- [x] 10+ PO's gegenereerd en getest
- [x] Eerste end-to-end test geslaagd (intern + extern)

---

## Problemen Dag 2

| Probleem | Oplossing |
|---|---|
| **`mysql2` `LIMIT ?` werkt niet** | string-interpolatie in plaats van placeholder voor LIMIT |
| **Decimal-waardes komen als strings** | `decimalNumbers: true` in pool config |
| **Externe PO's bleven 'pending'** | bleek dat we niet pollden — `pollAckOut` job toegevoegd |
| **CB-token verviel halverwege test** | refresh-job toegevoegd op 3.5u (TTL is 4u) |
| **Eerste IBAN-generator gaf ongeldige checksums** | `genValidBeIban()` met mod-97 checksum |
| **CB rejecteerde sommige IBANs als 18 chars** | terug naar BE-norm 16 chars |
