# PingFin API Documentatie

## Snel starten (lokaal via Docker)

```bash
# 1. Maak .env bestanden aan (kopieer voorbeeld en vul echte waarden in)
cp api/.env.example api/.env
cp bank2/.env.example bank2/.env
# Open de .env bestanden en vul DB_PASS en CB_TOKEN in

# 2. Start alles
docker compose up --build

# 3. Open de GUI
#    http://localhost:8080

# 4. Bank1 API: http://localhost:3000
# 5. Bank2 API: http://localhost:3001
```

> **Opmerking:** Externe CB-betalingen werken pas met een geldig `CB_TOKEN`.  
> Vraag je token aan via `POST https://stevenop.be/pingfin/api/v2/token` met je BIC en secret_key.  
> Interne betalingen (ob_id === bb_id) werken zonder CB_TOKEN.

> **Bank2 GUI:** De GUI heeft een **Bank1 / Bank2 selector** in de header (rechts naast de BIC-badge).  
> Schakel naar Bank2 om alle tabbladen (Dashboard, Accounts, PO_OUT, PO_IN, ACK_IN, ACK_OUT) met Bank2-data te laden.  
> Bank2 API heeft géén `/api` prefix — de GUI past de base-URL automatisch aan (`http://localhost:3001`).  
> Manuele PO voor Bank2 stuurt naar `http://localhost:3001/po_new/manual`.  
> De gekozen bank wordt opgeslagen in `localStorage` en blijft actief na een refresh.

---

## Overzicht

| Bank  | BIC      | Poort | Base URL              |
|-------|----------|-------|-----------------------|
| Bank1 | CEKVBE88 | 3000  | http://localhost:3000 |
| Bank2 | HOMNBEB1 | 3001  | http://localhost:3001 |

Central Bank (CB): `https://stevenop.be/pingfin/api/v2`

---

## Numerieke PingFin-codes

| Code | Betekenis                  |
|------|---------------------------|
| 2000 | OK / Succes                |
| 4001 | Interne transactie         |
| 4002 | Bedrag boven €500          |
| 4003 | Ongeldig / negatief bedrag |
| 4004 | Onbekende BB (BIC)         |
| 4005 | Duplicate PO               |
| 4101 | Account onbekend           |
| 4102 | Onvoldoende saldo          |

---

## Omgeving-variabelen

### Bank1 (`api/.env`)

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=<wachtwoord>
DB_NAME=pingfin_team20
PORT=3000
CB_URL=https://stevenop.be/pingfin/api/v2
CB_TOKEN=<token van CB>
BIC=CEKVBE88
```

### Bank2 (`bank2/.env`)

```
DB2_HOST=localhost
DB2_PORT=3306
DB2_USER=root
DB2_PASS=<wachtwoord>
DB2_NAME=pingfin_bank2
PORT2=3001
CB_URL2=https://stevenop.be/pingfin/api/v2
CB_TOKEN2=<token van CB>
CB_BIC2=HOMNBEB1
CB_SECRET2=<secret key>
```

---

## Bank1 Endpoints (CEKVBE88 — poort 3000)

### GET /api/info

Bank-informatie.

**Response:**
```json
{ "ok": true, "data": { "bank_name": "PingFin Bank Team 20", "bic": "CEKVBE88", "team": 20 } }
```

---

### GET /api/accounts

Alle rekeningen.

```bash
curl http://localhost:3000/api/accounts
```

**Response:**
```json
{ "ok": true, "data": [{ "id": "BE68539007547034", "owner_name": "Jan Janssen", "balance": "5000.00" }] }
```

---

### GET /api/accounts/:iban

Één rekening opzoeken.

```bash
curl http://localhost:3000/api/accounts/BE68539007547034
```

**Fout (4101):**
```json
{ "ok": false, "code": 4101, "message": "Account not found" }
```

---

### GET /api/po_new/generate?count=5

Genereer automatisch POs (staging). Gebruikt echte IBANs uit de DB.

```bash
curl "http://localhost:3000/api/po_new/generate?count=3"
```

---

### POST /api/po_new/add

Sla gegenereerde POs op in de staging-tabel.

```bash
curl -X POST http://localhost:3000/api/po_new/add \
  -H "Content-Type: application/json" \
  -d '{"data": [{"po_id":"CEKVBE88_abc12345","po_amount":50.00,"po_message":"Test","po_datetime":"2026-04-28 10:00:00","ob_id":"CEKVBE88","oa_id":"BE68539007547034","bb_id":"GKCCBEBB","ba_id":"BE43068999999501"}]}'
```

---

### POST /api/po_new/manual

Manuele PO aanmaken (wordt direct in po_new gezet).

```bash
curl -X POST http://localhost:3000/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{"oa_id":"BE68539007547034","ba_id":"BE43068999999501","bb_id":"GKCCBEBB","po_amount":75.50,"po_message":"Manuele betaling"}'
```

**Foutcodes:** 4002 (bedrag > 500), 4003 (negatief bedrag), 4004 (ongeldige BIC), 4101 (ongeldig IBAN)

---

### GET /api/po_new/process

Verwerk alle staged POs:
- **Interne PO** (`ob_id === bb_id`): OA gedebiteerd, BA gecrediteerd, geen CB-call, code 2000
- **Externe PO** (`ob_id !== bb_id`): OA gedebiteerd, PO naar CB gestuurd via `POST /po_in`

```bash
curl http://localhost:3000/api/po_new/process
```

**Response:**
```json
{
  "data": [
    { "po_id": "CEKVBE88_abc12345", "status": "COMPLETED", "code": 2000, "type": "internal" },
    { "po_id": "CEKVBE88_xyz98765", "status": "PENDING",   "code": 2000, "type": "external" },
    { "po_id": "CEKVBE88_err00001", "status": "REJECTED",  "code": 4102 }
  ]
}
```

---

### GET /api/po_out

Uitgaande POs (extern).

```bash
curl http://localhost:3000/api/po_out
```

---

### GET /api/po_in

Inkomende POs.

```bash
curl http://localhost:3000/api/po_in
```

---

### POST /api/po_in

Ontvang een inkomende PO van de CB (wij zijn BB). Crediteert de BA.

```bash
curl -X POST http://localhost:3000/api/po_in \
  -H "Content-Type: application/json" \
  -d '{"data":[{"po_id":"GKCCBEBB_test0001","po_amount":100.00,"po_message":"Test","po_datetime":"2026-04-28 10:00:00","ob_id":"GKCCBEBB","oa_id":"BE00000000000001","ob_code":2000,"cb_code":2000,"bb_id":"CEKVBE88","ba_id":"BE68539007547034"}]}'
```

**Response:**
```json
{ "data": [{ "po_id": "GKCCBEBB_test0001", "bb_code": 2000, "bb_datetime": "2026-04-28 10:00:05" }] }
```

---

### GET /api/ack_in

Inkomende ACKs (van CB voor onze PO_OUT).

```bash
curl http://localhost:3000/api/ack_in
```

---

### POST /api/ack_in

Ontvang een ACK van CB voor een uitgaande PO.
- `bb_code == 2000`: betaling bevestigd, po_out.status = 'processed'
- `bb_code >= 4000`: betaling mislukt, po_out.status = 'failed', OA wordt teruggestort

```bash
curl -X POST http://localhost:3000/api/ack_in \
  -H "Content-Type: application/json" \
  -d '{"data":[{"po_id":"CEKVBE88_abc12345","cb_code":2000,"cb_datetime":"2026-04-28 10:01:00","bb_code":2000,"bb_datetime":"2026-04-28 10:00:55"}]}'
```

---

### GET /api/ack_out

Verstuurde ACKs (van ons naar CB voor inkomende POs).

```bash
curl http://localhost:3000/api/ack_out
```

---

## Bank2 Endpoints (HOMNBEB1 — poort 3001)

Bank2 heeft dezelfde endpoints maar zonder `/api` prefix:

| Method | Path               | Beschrijving                        |
|--------|--------------------|-------------------------------------|
| GET    | /                  | Health check                        |
| GET    | /accounts          | Alle rekeningen                     |
| GET    | /po_in             | Inkomende POs                       |
| GET    | /po_out            | Uitgaande POs                       |
| POST   | /po_in             | Ontvang PO van CB (wij = BB)        |
| POST   | /ack_in            | Ontvang ACK van CB (wij = OB)       |
| GET    | /ack_in            | Inkomende ACKs                      |
| GET    | /ack_out           | Uitgaande ACKs                      |
| GET    | /po_new/generate   | Genereer POs automatisch            |
| POST   | /po_new/add        | Sla POs op in staging               |
| GET    | /po_new/process    | Verwerk staging POs                 |
| POST   | /po_new/manual     | Manuele PO aanmaken                 |

Vervang poort 3000 door 3001 en verwijder het `/api` prefix:

```bash
curl http://localhost:3001/accounts
curl http://localhost:3001/po_new/process
```

---

## PO-flows

### Interne PO (ob_id === bb_id)

```
POST /api/po_new/manual  { bb_id: "CEKVBE88" }
→ GET /api/po_new/process
→ OA gedebiteerd
→ BA gecrediteerd
→ code 2000, status COMPLETED
→ Geen CB-call
```

### Externe PO (ob_id !== bb_id)

```
POST /api/po_new/manual  { bb_id: "GKCCBEBB" }
→ GET /api/po_new/process
→ OA gedebiteerd
→ POST https://stevenop.be/pingfin/api/v2/po_in  { data: [po] }
→ CB valideert → stuurt naar BB
→ BB crediteert BA → stuurt ACK naar CB
→ CB stuurt ACK naar OB via POST /api/ack_in
→ po_out.status = 'processed' (of 'failed' + refund)
```

### Inkomende PO (wij = BB)

```
POST /api/po_in  { data: [po] }   ← CB stuurt dit
→ Duplicate check
→ Bedrag-validatie
→ BA bestaat?
→ BA gecrediteerd (balance + amount)
→ po_in geregistreerd
→ ack_out geregistreerd
→ bb_code: 2000
```

---

## Validatieregels

| Veld      | Regel                                     |
|-----------|-------------------------------------------|
| BIC       | `/^[A-Z]{4}BE[A-Z0-9]{2}$/`             |
| IBAN      | `/^BE\d{14}$/`                            |
| amount    | number, > 0, <= 500, max 2 decimalen     |
| po_id     | uniek, formaat `BIC_xxxxxxxx`             |

---

## Response-formaat

```json
{
  "ok": true,
  "status": 200,
  "code": null,
  "message": null,
  "data": [...]
}
```

Bij fout:
```json
{
  "ok": false,
  "status": 400,
  "code": 4102,
  "message": "Onvoldoende saldo",
  "data": null
}
```
