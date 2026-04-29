# Geld-flow: wanneer storten, wanneer refunden?

## Algemeen principe

> **Validate first, move money second, refund on failure.**

We bewegen het geld pas nadat de eerste validaties slagen. Daarna kan het op verschillende momenten alsnog terug — afhankelijk van waar de fout valt.

---

## 1. OB-kant — wij sturen een PO

Bron: [Bank N/services/poProcessor.js](../Bank%201/services/poProcessor.js)

| Stap | Wat | Geld bewogen? | Bij fout: refund? |
|---|---|---|---|
| 1 | po_id-prefix check (manual: `BIC_…`) | ❌ nog niet | ❌ niets te refunden |
| 2 | BIC + IBAN formaat (BB, OA, BA) | ❌ | ❌ |
| 3 | Bedrag-check (>0, ≤500, max 2 decimalen) | ❌ | ❌ |
| 4 | OA bestaat in `accounts`? | ❌ | ❌ |
| 5 | OA saldo ≥ bedrag? | ❌ | ❌ |
| 6 | **Internal payment**: atomische TX → debit OA + credit BA | ✅ ja | ✅ rollback bij DB-fout (alles of niets) |
| 7 | **External payment**: insert `po_out` + **debit OA** + POST naar CB | ✅ **DEBIT OA hier** | zie 8/9/10 |
| 8 | CB antwoordt 4002/4003/4004/4005/4006/4007 | al gedebiteerd | ✅ **inline refund** + status='failed' |
| 9 | BB stuurt later negatieve ACK (≠ 2000) | al gedebiteerd | ✅ refund via `ackInService.js` |
| 10 | Geen ACK binnen 1 uur | al gedebiteerd | ✅ refund via `timeoutMonitor.js` → status='timeout' |

**Belangrijk:** bij externe PO's debiteren we de OA **vóór** we de CB-call doen. Drie redenen om eventueel te refunden = drie paden, elk gedekt.

---

## 2. BB-kant — wij ontvangen een PO

Bron: [Bank N/services/poInService.js](../Bank%201/services/poInService.js)

De BA wordt pas gecrediteerd als **alle 7 validaties slagen**:

| Stap | Wat | Foutcode | Geld bewogen? |
|---|---|---|---|
| 1 | `bb_id` == onze BIC? | **4004** BB_UNKNOWN | ❌ nooit gecrediteerd |
| 2 | `po_id` formaat OK? | **4006** OB_MISMATCH | ❌ |
| 3 | `ob_id` geldige BIC? | **4006** | ❌ |
| 4 | `ba_id` geldig IBAN? | **4101** ACCOUNT_UNKNOWN | ❌ |
| 5 | duplicate `po_id`? | **4005** DUPLICATE_PO | ❌ (re-ack alleen) |
| 6 | bedrag valid? | **4002 / 4003** | ❌ |
| 7 | BA bestaat in onze accounts? | **4101** | ❌ |
| 8 | **Alles OK** → atomische TX: credit BA + insert po_in + insert tx + queue ack_out | **2000** OK | ✅ +€amount op BA |
| 9 | DB-fout tijdens credit | 4101 | ❌ rollback — niks gecrediteerd |

**Voor élke fout** schrijven we tóch een rij naar `po_in` en `ack_out` met de foutcode (via `persistRejection()`) zodat de OB altijd een ACK terugkrijgt.

---

## 3. Volledige fout-matrix

| Code | Naam | Wanneer | Geld effect |
|---|---|---|---|
| **2000** | OK | succesvolle TX, end-to-end | OA -€X, BA +€X |
| **4001** | INTERNAL_TX | interne PO foutief naar CB gestuurd | n.v.t. (we doen 't niet) |
| **4002** | AMOUNT_EXCEEDED | bedrag > €500 | geen debit, OF inline refund |
| **4003** | AMOUNT_INVALID | bedrag ≤ 0 of NaN | geen debit, OF inline refund |
| **4004** | BB_UNKNOWN | ontvangende BIC bestaat niet | inline refund (OB) / niks gecrediteerd (BB) |
| **4005** | DUPLICATE_PO | po_id al verzonden | inline refund / niks |
| **4006** | OB_MISMATCH | po_id-prefix klopt niet met ob_id | geen debit / niks |
| **4007** | DUP_IN_BATCH | 2× zelfde po_id in 1 batch | inline refund |
| **4101** | ACCOUNT_UNKNOWN | OA of BA bestaat niet of ongeldige IBAN | geen debit / niks |
| **4102** | INSUFFICIENT_BALANCE | OA-saldo < bedrag | geen debit |
| **timeout** | (geen code) | geen ACK binnen 1u | refund OA na 1u |

---

## 4. Hoe doen we de validaties in de code?

**Stijl: early-return guard clauses** (geen geneste if/else, geen switch, geen try/catch voor flow-control).

```js
async function processPoIn(po) {
  const ts = now();
  const snapshot = { ...po };

  // 1. BB ID check — early return
  if (po.bb_id && po.bb_id.toUpperCase() !== BIC.toUpperCase()) {
    await persistRejection(po, C.BB_UNKNOWN, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.BB_UNKNOWN };
  }

  // 2. Format check — early return
  if (!validPoIdFormat(po.po_id, po.ob_id)) {
    await persistRejection(po, C.OB_MISMATCH, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.OB_MISMATCH };
  }

  // 3. IBAN check — early return
  if (!validIban(po.ba_id)) {
    await persistRejection(po, C.ACCOUNT_UNKNOWN, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN };
  }

  // ... 4 t/m 7 op zelfde manier ...

  // 8. ALLES OK → atomische TX
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', ...);
    await conn.query('INSERT INTO po_in ...');
    await conn.query('INSERT INTO transactions ...');
    await conn.query('INSERT INTO ack_out ...');
    await conn.commit();
  } catch (err) {
    await conn.rollback();   // ← geld blijft staan bij fout
    await persistRejection(po, C.ACCOUNT_UNKNOWN, ts, snapshot);
  }
}
```

**Drie technieken die we combineren:**

1. **Guard clauses** — top-down if-checks met early return, leest als de manual-checklist
2. **Pure validators** in [`lib/validate.js`](../Bank%201/lib/validate.js) — `validBic()`, `validIban()`, `amountErrorCode()`, `validPoIdFormat()` — herbruikbaar tussen OB- en BB-kant
3. **Atomische DB-transactie** — `beginTransaction` / `commit` / `rollback` zorgt dat een crash midden in een credit nooit half geld op de rekening laat

---

## 5. Mondelinge samenvatting (voor presentatie)

> We bewegen het geld pas nadat al onze syntactische validaties slagen — BIC, IBAN, bedrag, accountbestaan, saldo.
>
> Op de **OB-kant** debiteren we de OA vóór we naar de CB sturen, want we willen het saldo locken; als de CB ons afwijst (4002 t/m 4007) refunden we **inline** in dezelfde request, anders refunden we via de **negative-ACK handler** of na 1 uur via de **timeout monitor**.
>
> Op de **BB-kant** crediteren we de BA pas in een **atomische DB-transactie** samen met de tx- en ack-row, dus rollback bij elk DB-probleem.
>
> De validaties zelf zijn **guard clauses**: top-down if-checks met early return, in dezelfde volgorde als de manual ze opsomt. Geen switch, geen geneste if-else — leest als een checklist. De checks zelf staan in een aparte `validate.js` zodat OB- en BB-kant exact dezelfde regels delen.
