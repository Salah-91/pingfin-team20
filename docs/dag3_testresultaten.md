# Dag 3 — Testresultaten

**Datum:** 28 april 2026  
**Team:** 20  
**BIC Bank1:** CEKVBE88 (poort 3000)  
**BIC Bank2:** HOMNBEB1 (poort 3001)

---

## Uitgevoerde tests

### TS-00: Docker compose start

```bash
docker compose up --build
```

| Stap | Resultaat |
|------|-----------|
| `db` service start (MySQL 8) | ✅ Geslaagd |
| `bank1` start op poort 3000 | ✅ Geslaagd |
| `bank2` start op poort 3001 | ✅ Geslaagd |
| `gui` (nginx) start op poort 8080 | ✅ Geslaagd |

---

### TS-01: Health endpoints

```bash
curl http://localhost:3000/
curl http://localhost:3001/
```

| Test | Verwacht | Resultaat |
|------|----------|-----------|
| Bank1 health check | `{ "ok": true }` | ✅ Geslaagd |
| Bank2 health check | `{ "ok": true }` | ✅ Geslaagd |

---

### TS-02: GUI opent

- URL: `http://localhost:8080`
- Dashboard laadt bankinfo en statistieken
- Accounts-sectie toont IBANs en saldo's

| Test | Resultaat |
|------|-----------|
| GUI bereikbaar op localhost:8080 | ✅ Geslaagd |
| Accounts tabel toont IBAN + naam + saldo | ✅ Geslaagd |

> **Opmerking:** GUI toont enkel Bank1 data. Bank2 wordt via API/curl getest (geen GUI-selector aanwezig).

---

### TS-03: Manuele interne PO (Bank1)

**Scenario:** Betaling binnen Bank1 zelf — geen CB-call.

```bash
curl -X POST http://localhost:3000/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{
    "oa_id":      "BE12890123456789",
    "ba_id":      "BE23901234567890",
    "bb_id":      "CEKVBE88",
    "po_amount":  15.00,
    "po_message": "Interne test"
  }'
curl http://localhost:3000/api/po_new/process
```

| Stap | Verwacht | Resultaat |
|------|----------|-----------|
| PO aangemaakt | `po_id: "CEKVBE88_xxxxxxxx"` | ✅ |
| Verwerking | `status: "COMPLETED"`, `code: 2000` | ✅ |
| OA saldo (Nora Pieters) | 5000 → 4985 | ✅ |
| BA saldo (Arthur Wouters) | 5000 → 5015 | ✅ |
| Geen CB-call uitgevoerd | `type: "internal"` | ✅ |

**Resultaat: ✅ Geslaagd**

---

### TS-04: Account unknown (code 4101)

**Scenario:** PO naar onbekende BA geeft code 4101.

```bash
curl -X POST http://localhost:3000/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{
    "oa_id":      "BE12890123456789",
    "ba_id":      "BE00000000000000",
    "bb_id":      "CEKVBE88",
    "po_amount":  10.00
  }'
curl http://localhost:3000/api/po_new/process
```

| Test | Verwacht | Resultaat |
|------|----------|-----------|
| Status | `REJECTED` | ✅ |
| Code | `4101` | ✅ |

**Resultaat: ✅ Geslaagd**

---

### TS-05: Externe PO naar CB (gedeeltelijk getest)

> **Status: ⚠️ Niet volledig getest**  
> De externe CB-flow vereist een geldig `CB_TOKEN` in `api/.env`.  
> Met een placeholder token krijg je een CB-fout (401 of timeout), maar de server crasht niet — de fout wordt gelogd in de `logs` tabel en de PO krijgt status `PENDING`.

**Wat werkt:**
- PO wordt aangemaakt in `po_new`
- OA wordt gedebiteerd bij verwerking
- PO wordt verplaatst naar `po_out`
- CB-call wordt geprobeerd (fout wordt gelogd)
- Server blijft draaien

**Wat nog nodig is:**
1. Vraag een geldig `CB_TOKEN` aan (zie instructies hieronder)
2. Herhaal `GET /api/po_new/process`
3. Verificeer dat `cb_code` correct ingevuld wordt in `po_out`
4. Wacht op `POST /api/ack_in` van CB

**Token aanvragen:**
```bash
curl -X POST https://stevenop.be/pingfin/api/v2/token \
  -H "Content-Type: application/json" \
  -d '{"bic": "CEKVBE88", "secret_key": "<jouw secret_key>"}'
```
Zet het token in `api/.env` als `CB_TOKEN=<token>` en herstart Bank1.

---

### TS-06: Bank2 via API

Bank2 heeft geen GUI-integratie, maar reageert correct via curl:

```bash
curl http://localhost:3001/accounts
curl http://localhost:3001/po_in
```

| Test | Resultaat |
|------|-----------|
| Bank2 accounts endpoint | ✅ Geslaagd |
| Bank2 po_in endpoint | ✅ Geslaagd |

---

## Testscenario's voor verdere validatie

De onderstaande tests zijn nog niet uitgevoerd en kunnen gedaan worden zodra een geldig `CB_TOKEN` beschikbaar is.

### TS-07: Bedrag boven €500

```bash
curl -X POST http://localhost:3000/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{"oa_id":"BE68539007547034","ba_id":"BE43068999999501","bb_id":"CEKVBE88","po_amount":999.99}'
```
**Verwacht:** `{ "ok": false, "code": 4002 }`

---

### TS-08: Onvoldoende saldo (code 4102)

```bash
# Verlaag saldo tijdelijk:
# UPDATE accounts SET balance = 5.00 WHERE id = 'BE68539007547034';

curl -X POST http://localhost:3000/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{"oa_id":"BE68539007547034","ba_id":"BE43068999999501","bb_id":"CEKVBE88","po_amount":200.00}'
curl http://localhost:3000/api/po_new/process
```
**Verwacht:** `{ "status": "REJECTED", "code": 4102 }`

---

### TS-09: Duplicate PO (code 4005)

```bash
# Stuur dezelfde po_id twee keer naar /api/po_in
curl -X POST http://localhost:3000/api/po_in \
  -H "Content-Type: application/json" \
  -d '{"data":[{"po_id":"GKCCBEBB_duptest1","po_amount":10.00,"po_datetime":"2026-04-28 10:00:00","ob_id":"GKCCBEBB","oa_id":"BE99999999999999","ob_code":2000,"cb_code":2000,"bb_id":"CEKVBE88","ba_id":"BE68539007547034"}]}'
# Herhaal exact dezelfde call:
curl -X POST http://localhost:3000/api/po_in \
  -H "Content-Type: application/json" \
  -d '{"data":[{"po_id":"GKCCBEBB_duptest1","po_amount":10.00,"po_datetime":"2026-04-28 10:00:00","ob_id":"GKCCBEBB","oa_id":"BE99999999999999","ob_code":2000,"cb_code":2000,"bb_id":"CEKVBE88","ba_id":"BE68539007547034"}]}'
```
**Verwacht (2e call):** `{ "data": [{ "bb_code": 4005 }] }`

---

### TS-10: Inkomende ACK van CB

```bash
# Vervang po_id door een echte po_id uit po_out:
curl -X POST http://localhost:3000/api/ack_in \
  -H "Content-Type: application/json" \
  -d '{"data":[{"po_id":"CEKVBE88_xxxxxxxx","cb_code":2000,"cb_datetime":"2026-04-28 10:02:00","bb_code":2000,"bb_datetime":"2026-04-28 10:01:55"}]}'
```
**Verwacht:**
- `po_out.status = 'processed'`
- Record in `ack_in`

---

## Checklist Definition of Done

| Item | Status |
|------|--------|
| `npm install` slaagt in `/api` | ✅ |
| `npm install` slaagt in `/bank2` | ✅ |
| Bank1 start zonder crash | ✅ |
| Bank2 start zonder crash | ✅ |
| `docker compose up --build` werkt | ✅ |
| Geen echte secrets in source, README of .env.example | ✅ |
| DB schema en queries matchen | ✅ |
| `accounts.id` = IBAN (VARCHAR 34) | ✅ |
| Bank2 crediteert BA met `balance + amount` | ✅ |
| Numerieke PingFin-codes (2000, 4xxx) | ✅ |
| Manuele interne PO werkt (code 2000) | ✅ |
| Account unknown geeft code 4101 | ✅ |
| Interne PO: geen CB-call | ✅ |
| Externe PO naar CB gestuurd | ⚠️ Vereist geldig CB_TOKEN |
| POST /api/po_in aanwezig (BB-zijde) | ✅ |
| POST /api/ack_in aanwezig (OB-zijde) | ✅ |
| Backend logs in DB-tabel `logs` | ✅ |
| Saldowijzigingen in `transactions` | ✅ |
| Server crasht niet bij fouten | ✅ |
| `docs/api.md` aanwezig | ✅ |
| `docs/dag3_testresultaten.md` aanwezig | ✅ |
| GUI toont Bank1 data | ✅ |
| Bank2 getest via API/curl | ✅ |
