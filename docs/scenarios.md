# Visualisatie SEPA Messaging Scheme — 5 Use Cases

> Hoe een Payment Order door het systeem reist, per scenario uit de manual.

---

## Legenda

| Symbool | Betekenis |
|---|---|
| `→` | Synchrone HTTP call |
| `↓` | Polling / async retrieval |
| `✅` | Succesvolle stap |
| `❌` | Validatie faalt / reject |
| `🔄` | Auto-refund door background job |

---

## Use Case 1 — OB validatie faalt

**Voorbeeld:** Onbekende OA-account, bedrag > €500, of ongeldige IBAN.

```
OB (Bank 1)              CB              BB (Bank 2)
─────────────            ──              ────────────

processPoNew()
  │
  ▼
Validate
  ├─ BIC?       OK
  ├─ IBAN OA?   ❌ FAIL
  │
  ▼
Status: REJECTED
Code: 4101 / 4102
  │
  ▼
Log event
po_rejected
  │
  ▼
DELETE po_new
(geen geld bewogen)
```

**Resultaat:** Geen TX, geen geld bewogen, alleen log-entry. PO bereikt CB nooit.

---

## Use Case 2 — Interne betaling (zelfde bank)

**Voorbeeld:** Bank 1 stuurt €50 van rekening A naar rekening B, beide in Bank 1.

```
OB = BB (Bank 1)         CB              BB (Bank 1)
─────────────            ──              ────────────

processPoNew()
  │
  ▼
Validate           OK ✅
isInternal         (bb_id == BIC)
  │
  ▼
beginTransaction()
  │
  ├─ UPDATE OA balance -50
  ├─ UPDATE BA balance +50
  ├─ INSERT transactions × 2 (debit + credit)
  ├─ DELETE po_new
  │
  ▼
commit()
Status: COMPLETED
Code: 2000
```

**Resultaat:** Atomische dubbele saldo-update, geen CB-betrokkenheid. End-to-end < 100 ms.

**GUI feedback:** Toast "🔁 Interne betaling voltooid · €50.00" + 2× "💰 Saldo gewijzigd".

---

## Use Case 3 — Externe betaling, OB OK, CB rejecteert

**Voorbeeld:** Bank 1 stuurt naar onbekende BIC `XXXXBEBB`.

```
OB (Bank 1)              CB                          BB
─────────────            ──                          ──

processPoNew()
  │
  ▼
Validate            OK ✅
isInternal          NO (extern)
  │
  ▼
INSERT po_out (status=pending)
  │
  ▼
DEBIT OA  (-€amount)
INSERT transactions
  │
  ▼
POST /po_in    ──────────────────►   CB.po_in
                                       │
                                       ▼
                                     Validate
                                     bb_id?  ❌ UNKNOWN
                                       │
                                       ▼
   ◄────────── { code: 4004 } ────────┘

  │
  ▼
Inline refund (poProcessor)
  │
  ├─ UPDATE OA balance +€amount
  ├─ INSERT transactions (refund)
  ├─ UPDATE po_out status='failed'
  │
  ▼
Status: FAILED
Code: 4004 (BB_UNKNOWN)
```

**GUI feedback Bank 1:** "📤 PO verstuurd" → "🔴 PO geweigerd (4004)" → "🔄 Refund OA"

---

## Use Case 4 — OB + CB OK, BB rejecteert

**Voorbeeld:** Bank 1 stuurt €50 naar Bank 2 met onbestaande BA-account.

```
OB (Bank 1)              CB                       BB (Bank 2)
─────────────            ──                       ────────────

processPoNew()  OK ✅
INSERT po_out (pending)
DEBIT OA
  │
  ▼
POST /po_in   ──────►   CB.po_in
                          │
                          ▼
                     CB validate    OK ✅
                          │
                          ▼
                     queue → CB.po_out
                          │
                          ▼ (poll 5s)
                                              GET /po_out
                                                   │
                                                   ▼
                                            processPoIn()
                                                   │
                                                   ├─ bb_id?    OK
                                                   ├─ po_id?    OK
                                                   ├─ ba_id?    ❌ NOT IN accounts
                                                   │
                                                   ▼
                                            persistRejection(4101)
                                            INSERT po_in (bb_code=4101)
                                            INSERT ack_out (sent_to_cb=0)
                                                   │
                                                   ▼
                                            POST /ack_in   ──┐
                          ◄────────────────────── ack_out ──┘
                          │
                          ▼
                     queue → CB.ack_out
                          │
                          ▼
  ◄── poll 5s ── GET /ack_out
processAckIn()
  │
  ├─ bb_code = 4101 (negatief)
  ├─ UPDATE OA balance +€amount  (refund)
  ├─ UPDATE po_out status='failed'
  ├─ INSERT transactions (refund row)
  │
  ▼
Status: FAILED
Code: 4101
```

**GUI Bank 1:** "📤 PO verstuurd" → "➖ Debit" → (5s later) "🔴 Negatieve ACK 4101" → "🔄 Refund"

**GUI Bank 2:** "📥 PO afgewezen 4101" + log-event `po_rejected`

---

## Use Case 5 — Volledig succes (happy path)

**Voorbeeld:** Bank 1 stuurt €25 naar geldige Bank 2 account.

```
OB (Bank 1)              CB                       BB (Bank 2)
─────────────            ──                       ────────────

processPoNew()  OK ✅
INSERT po_out (pending)
DEBIT OA
  │
  ▼
POST /po_in   ──────►   CB.po_in
                          │
                          ▼
                     CB validate    OK ✅
                     queue → CB.po_out
                          │
                          ▼ (poll 5s)
                                              GET /po_out
                                                   │
                                                   ▼
                                            processPoIn()
                                                   │
                                                   ├─ bb_id?  OK
                                                   ├─ po_id?  OK
                                                   ├─ ba_id?  OK
                                                   ├─ amount? OK
                                                   │
                                                   ▼
                                            beginTransaction()
                                            ├─ UPDATE BA balance +€amount
                                            ├─ INSERT po_in (bb_code=2000)
                                            ├─ INSERT transactions (credit)
                                            ├─ INSERT ack_out
                                            └─ commit()
                                                   │
                                                   ▼
                                            POST /ack_in (bb_code=2000)
                          ◄──────────────────────────────
                          │
                          ▼
                     CB.ack_in → ack_out
                          │
                          ▼
  ◄── poll 5s ── GET /ack_out
processAckIn()
  │
  ├─ bb_code = 2000 ✅
  ├─ UPDATE po_out status='processed'
  ├─ UPDATE transactions iscomplete=1
  │
  ▼
Status: PROCESSED
Code: 2000

End-to-end roundtrip: ~10-15 seconden
```

**GUI Bank 1 timeline:**
- t=0s: ✅ Manuele PO aangemaakt → ⚙️ Auto-verwerkt → 📤 PO verstuurd → ➖ Debit
- t=10-15s: ✅ ACK ontvangen → status='processed'

**GUI Bank 2 timeline (5-10s na verzending):**
- 📥 Nieuwe inkomende PO verwerkt → ➕ Credit → 💰 Saldo gewijzigd

---

## Exception 1 — CB onbereikbaar

**Wat als de CB niet antwoordt op `POST /po_in`?**

```
OB (Bank 1)
─────────────

processPoNew()
INSERT po_out (pending)
DEBIT OA
  │
  ▼
POST /po_in    ───X───  (CB timeout/network error)
  │
  ▼
catch err     →     log 'cb_error'
              →     status blijft 'pending'
  │
  ▼
(po_out wacht op ACK die nooit komt)

  │
  ▼ (na 1 uur)
timeoutMonitor (elke 5 min)
  │
  ├─ SELECT po_out WHERE status='pending'
  │     AND ob_datetime < NOW() - 1h
  │
  ├─ UPDATE OA balance +€amount  (refund)
  ├─ UPDATE po_out status='timeout'
  ├─ INSERT transactions (refund)
  │
  ▼
🔄 AUTO-REFUND
```

---

## Exception 2 — BB stuurt geen ACK

**Wat als BB de PO ontvangt maar wij geen ACK terug krijgen via CB?**

```
OB (Bank 1)              CB.ack_out
─────────────            ──────────

PO verstuurd
po_out (pending)
DEBIT OA
  │
  ▼ (poll 5s)
GET /ack_out    →    leeg / niets voor onze po_id
  │
  ▼ (telkens 5s, een uur lang)
nog steeds niets
  │
  ▼ (na 1 uur)
timeoutMonitor → 🔄 AUTO-REFUND
```

---

## Samenvatting van geld-bewegingen

| Use case | OA debit | BA credit | Refund? |
|---|---|---|---|
| 1 — OB-fail | ❌ niet bewogen | ❌ niet bewogen | n.v.t. |
| 2 — Intern OK | ✅ -€amount | ✅ +€amount | n.v.t. |
| 3 — CB-reject | ✅ tijdelijk | ❌ niet bewogen | ✅ inline |
| 4 — BB-reject | ✅ tijdelijk | ❌ niet bewogen | ✅ via neg-ACK |
| 5 — Happy path | ✅ -€amount | ✅ +€amount (andere bank) | n.v.t. |
| Exc 1 — CB down | ✅ tijdelijk | — | ✅ na 1u (timeout) |
| Exc 2 — Geen ACK | ✅ tijdelijk | — | ✅ na 1u (timeout) |

**Conclusie:** Geen enkele PO blijft hangen, geen geld kan verloren gaan. Self-healing system met 5 background jobs.

---

## Bijhorende code-files

| Stap | Bestand |
|---|---|
| OB-zijde processing | [`Bank N/services/poProcessor.js`](../Bank%201/services/poProcessor.js) |
| BB-zijde processing | [`Bank N/services/poInService.js`](../Bank%201/services/poInService.js) |
| ACK afhandeling | [`Bank N/services/ackInService.js`](../Bank%201/services/ackInService.js) |
| Background jobs | [`Bank N/jobs/`](../Bank%201/jobs/) |
| Validatie helpers | [`Bank N/lib/validate.js`](../Bank%201/lib/validate.js) |
| Foutcodes | [`Bank N/codes.js`](../Bank%201/codes.js) |
