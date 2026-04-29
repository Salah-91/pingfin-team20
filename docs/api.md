# PingFin Team 20 — API Documentatie (v3)

**Datum:** 29 april 2026
**Bank1:** CEKVBE88 — *PingFin Bank Team 20 — Bank1*
**Bank2:** HOMNBEB1 — *PingFin Bank Team 20 — Bank2*
**Clearing Bank:** `https://stevenop.be/pingfin/api/v2`

---

## 1. Architectuur

Eén Node/Express codebase (`/api`) wordt twee keer gestart, één per BIC. Elke instance draait met een eigen database (`pingfin_b1`, `pingfin_b2`) en eigen `INCOMING_TOKEN`. Beide instances:

* publiceren `/api/*` endpoints
* verifiëren Bearer-tokens op `POST /api/po_in` en `POST /api/ack_in`
* hosten zelf de GUI (`/`) — elke bank heeft een eigen `public/` folder die mee in de Docker-image gaat
* draaien achtergrondjobs:
  * **CB-token refresh** (4h TTL → 3.5h interval)
  * **BB-poller** elke 30s: `GET CB.po_out` → verwerk → `POST CB.ack_in`
  * **OB-poller** elke 30s: `GET CB.ack_out` → verwerk lokaal
  * **timeout-monitor** elke 5 min: outstanding po_out > 1u → refund OA

```
   ┌──────── GUI (statisch, gehost door bank-server) ────────┐
   │                                                          │
[Bank1]  ←HTTPS→  [Clearing Bank]  ←HTTPS→  [Bank2]
   │                                                          │
   └────────  MySQL (pingfin_b1, pingfin_b2)  ────────────────┘
```

---

## 2. Environment variabelen

| var | doel | voorbeeld |
|---|---|---|
| `BIC` | eigen BIC | `CEKVBE88` |
| `BANK_NAME` | weergegeven naam | `PingFin Bank Team 20 — Bank1` |
| `PORT` | HTTP-poort | `3000` |
| `DB_HOST/PORT/USER/PASS/NAME` | MySQL-credentials | `db / 3306 / root / … / pingfin_b1` |
| `CB_URL` | clearing bank base | `https://stevenop.be/pingfin/api/v2` |
| `CB_SECRET` | secret_key (door coach) | `…` |
| `CB_TOKEN` | optioneel; auto-refresh als leeg | – |
| `CB_POLL_MS` | poll-interval ms | `30000` |
| `INCOMING_TOKEN` | Bearer dat WIJ verwachten op `POST /po_in` en `POST /ack_in` | `changeme-bank1-incoming` |
| `JOBS_ENABLED` | zet polling/timeout aan | `true` |
| `OUTSTANDING_TIMEOUT_MS` | 1u in ms | `3600000` |
| `TEAM_MEMBERS` | JSON-array string | `[{"name":"…","role":"…"}]` |

---

## 3. Endpoints

### Public (geen auth)
| Method | Path | Beschrijving |
|---|---|---|
| GET | `/` | Health |
| GET | `/api/help` | Endpoint-overzicht |
| GET | `/api/info` | BIC, BANK_NAME, members |
| GET | `/api/accounts` | alle accounts (IBAN + saldo) |
| GET | `/api/accounts/:iban` | één account |
| GET | `/api/banks` | cache van `CB.banks` |
| GET | `/api/po_new` | inhoud PO_NEW |
| GET | `/api/po_new/generate?count=N` | genereer N willekeurige PO's |
| POST | `/api/po_new/add` | body `{ data: [PO,…] }` → toevoegen aan PO_NEW |
| POST | `/api/po_new/manual` | één manuele PO |
| GET | `/api/po_new/process` | verwerk alles in PO_NEW (intern of via CB) |
| GET | `/api/po_out` | uitgaande PO's |
| GET | `/api/po_in` | inkomende PO's |
| GET | `/api/ack_in` | ontvangen ACK's |
| GET | `/api/ack_out` | verstuurde ACK's |
| GET | `/api/transactions` | saldobewegingen |
| GET | `/api/logs?type=&limit=` | event log |
| GET | `/api/jobs/run/poll-po-out` | manueel BB-poller |
| GET | `/api/jobs/run/poll-ack-out` | manueel OB-poller |
| GET | `/api/jobs/run/timeout` | manueel timeout-monitor |
| GET | `/api/jobs/run/cb-token` | manueel CB-token verversen |

### Bearer-protected
| Method | Path | Beschrijving |
|---|---|---|
| POST | `/api/po_in` | inkomende PO's (van CB of OB) |
| POST | `/api/ack_in` | inkomende ACK (van CB) |

---

## 4. Foutcodes

Manual-conform + CB-codes:

| Code | Betekenis |
|---|---|
| 2000 | OK |
| 4001 | Interne transactie — niet naar CB |
| 4002 | Bedrag > €500 |
| 4003 | Bedrag negatief / ongeldig |
| 4004 | BB onbekend bij CB |
| 4005 | Duplicate po_id (al pending bij CB) |
| 4006 | OB-mismatch / po_id-prefix klopt niet |
| 4007 | Twee PO's met zelfde id in batch |
| 4101 | Account onbekend |
| 4102 | Onvoldoende saldo |

---

## 5. Lokaal opstarten

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| GUI (nginx + reverse proxy) | http://localhost:8080 |
| Bank1 (CEKVBE88) API + GUI mee gehost | http://localhost:8089 |
| Bank2 (HOMNBEB1) API + GUI mee gehost | http://localhost:8090 |
| MySQL | localhost:3306 |

De `db`-container maakt automatisch **twee databases** aan (`pingfin_b1`, `pingfin_b2`) via het root-bestand `pingfin_database.sql`.

---

## 6. Deployment op Railway

Twee services in hetzelfde project; per service stel je de **rootDir** in op de juiste bank-folder zodat Railway de bijbehorende `Dockerfile` gebruikt:

* **Service `bank1`** — rootDir = `Bank 1`, env uit `Bank 1/.env.example` + Railway-MySQL-vars
* **Service `bank2`** — rootDir = `Bank 2`, env uit `Bank 2/.env.example` + Railway-MySQL-vars

In de Railway MySQL-database voer je éénmalig `pingfin_database.sql` uit (twee databases worden aangemaakt).

---

## 7. Postman / Bruno test-recipes

Kort voorbeeld voor Bank1 (CEKVBE88):

```bash
# Genereer 5 willekeurige PO's
curl http://localhost:8089/api/po_new/generate?count=5

# Manuele PO (intern)
curl -X POST http://localhost:8089/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{"oa_id":"BE12890123456789","ba_id":"BE23901234567890","bb_id":"CEKVBE88","po_amount":15.00,"po_message":"interne test"}'

# Verwerk
curl http://localhost:8089/api/po_new/process

# Push een PO (alsof we de CB zijn)
curl -X POST http://localhost:8089/api/po_in \
  -H "Authorization: Bearer changeme-bank1-incoming" \
  -H "Content-Type: application/json" \
  -d '{"data":[{"po_id":"GKCCBEBB_test1","po_amount":12.50,"po_datetime":"2026-04-29 10:00:00","ob_id":"GKCCBEBB","oa_id":"BE99999999999999","ob_code":2000,"cb_code":2000,"bb_id":"CEKVBE88","ba_id":"BE68539007547034"}]}'
```
