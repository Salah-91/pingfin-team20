# PingFin — Team 20

**Banken:** CEKVBE88 (Bank1) & HOMNBEB1 (Bank2)
**Workshop:** 27–30 april 2026 — Odisee
**Coaches:** Rogier van der Linde & Polina Kozlova
**Team:** Salaheddine Sennouni · Saidi Marwan · Azouagh Abdallah · Abdeddoun Ayoub

Sample CB: <https://stevenop.be/pingfin/api/v2>

---

## 1. Wat zit er in?

Twee zelfstandige Node.js/Express applicaties — één per bank — elk in een eigen folder met eigen Dockerfile en docker-compose.yml. Beide instances:

* implementeren alle manual-endpoints onder `/api/*`
* hosten zelf hun GUI (`./public/`) op `/`
* draaien **vier achtergrondjobs**:
  1. CB-token auto-refresh (4u TTL → 3.5u interval)
  2. BB-poller `GET /po_out` elke 30s + `POST /ack_in` na verwerking
  3. OB-poller `GET /ack_out` elke 30s
  4. 1u-timeout-monitor voor outstanding po_out → refund OA
  5. ACK retry-flush (sent_to_cb=0 → CB) elke 60s

Eén MySQL-instance host **twee databases** (`pingfin_b1`, `pingfin_b2`); zo blijven de saldo's per bank gescheiden.

| Bank | BIC | Port | Database |
|---|---|---|---|
| Bank 1 | CEKVBE88 | **8089** | pingfin_b1 |
| Bank 2 | HOMNBEB1 | **8090** | pingfin_b2 |

---

## 2. Folderstructuur

```
pingfin-team20/
├── Bank 1/                       # CEKVBE88 — port 8089
│   ├── server.js                 # Express bootstrap + jobs.startAll()
│   ├── config.js · codes.js · db.js
│   ├── routes/   (help, info, accounts, banks, po, ack, misc, jobs)
│   ├── middleware/auth.js        # Bearer-verificatie
│   ├── lib/      (time, validate, log, cbToken, cbClient)
│   ├── services/ (poInService, poProcessor, ackInService)
│   ├── jobs/     (pollPoOut, pollAckOut, flushAckOut, timeoutMonitor)
│   ├── public/                   # GUI (index.html + js/ + css/)
│   ├── Dockerfile
│   ├── docker-compose.yml        # zelfstandig: db + bank1
│   ├── package.json · package-lock.json
│   └── .env / .env.example
├── Bank 2/                       # HOMNBEB1 — port 8090
│   └── (identiek aan Bank 1, andere env-waarden)
├── pingfin_database.sql          # creëert beide DB's + schema's + accounts
├── docker-compose.yml            # root: db + beide banken samen
├── docs/
└── README.md
```

---

## 3. Lokaal opstarten

### Beide banken samen (root)
```bash
# 1. Env-files maken
cp "Bank 1/.env.example" "Bank 1/.env"
cp "Bank 2/.env.example" "Bank 2/.env"
# Vul in elk:
#   - CB_SECRET       : secret_key per BIC (door coach geleverd)
#   - INCOMING_TOKEN  : kies een sterk token per bank

# 2. Start alles
docker compose up --build

# 3. Bezoek
#    http://localhost:8089  → Bank 1 (CEKVBE88) — GUI + API
#    http://localhost:8090  → Bank 2 (HOMNBEB1) — GUI + API
#    localhost:3306         → MySQL (pingfin_b1, pingfin_b2)
```

### Eén bank apart
```bash
cd "Bank 1"
docker compose up --build           # → 8089
# of
cd "Bank 2"
docker compose up --build           # → 8090 (db op 3307 host-zijde)
```

`docker compose up` voert eenmalig `pingfin_database.sql` uit om beide databases + schema's + accounts aan te maken.

---

## 4. Deployment op Railway

1. Maak in het Railway-project drie services:
   * **MySQL** (Railway-template)
   * **bank1** (root dir = `Bank 1`, env uit `.env.example`)
   * **bank2** (root dir = `Bank 2`, env uit `.env.example`)
2. Voer `pingfin_database.sql` éénmalig uit op de Railway-MySQL (Railway-CLI: `railway run mysql < pingfin_database.sql`).
3. Pas in elke service de env-vars aan:
   * `DB_HOST/PORT/USER/PASS` → Railway-MySQL credentials
   * `DB_NAME=pingfin_b1` (resp. `_b2`)
   * `CB_SECRET=…` (geheim; per BIC verschillend)
   * `INCOMING_TOKEN=…` (per bank verschillend)
4. Railway publiceert `https://bank1-…railway.app` en `https://bank2-…railway.app`.
   Beide hosten hun eigen GUI.

---

## 5. Volledig payment-cycle test (E2E)

```bash
# Bank1 → CB → Bank2
curl -X POST http://localhost:8089/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{"oa_id":"BE68539007547034","ba_id":"BE99100200300001","bb_id":"HOMNBEB1","po_amount":50.00,"po_message":"E2E test"}'

curl http://localhost:8089/api/po_new/process
# → status PENDING, cb_code 2000

# Wacht 30s (BB-poller op Bank2 haalt PO op + stuurt ACK terug naar CB)
# Wacht nog 30s (OB-poller op Bank1 haalt ACK op uit CB)

curl http://localhost:8089/api/ack_in     # → bb_code 2000
curl http://localhost:8089/api/po_out     # → status processed
curl http://localhost:8090/api/po_in      # → bb_code 2000 (Bank2 zicht)
curl http://localhost:8090/api/accounts   # → BE99100200300001 saldo 5050.00
```

---

## 6. Foutcodes (numeriek, manual + CB-conform)

| Code | Betekenis |
|---|---|
| 2000 | OK |
| 4001 | Interne TX (niet naar CB) |
| 4002 | Bedrag > €500 |
| 4003 | Bedrag negatief / ongeldig |
| 4004 | BB onbekend |
| 4005 | Duplicate po_id |
| 4006 | OB-mismatch / po_id-prefix |
| 4007 | Twee PO's met zelfde id in batch |
| 4101 | Account onbekend |
| 4102 | Onvoldoende saldo |

---

## 7. Beveiliging

* Inkomende `POST /api/po_in` en `POST /api/ack_in` verifiëren `Authorization: Bearer <INCOMING_TOKEN>`.
* Uitgaande calls naar de CB krijgen automatisch een vers `Bearer`-token (4u TTL, herfetched op 3.5u).
* `.env*` bestanden zijn ge-gitignored. Alleen `*.env*.example` gaan mee in de repo.
* GUI gebruikt **relatieve URLs** — geen hardcoded `localhost` meer.

---

## 8. Manual-conform schema

* `transactions`: één rij per saldobeweging met **signed amount** (BA positief, OA negatief), `isvalid`, `iscomplete` — exact zoals manual specificeert.
* `logs`: per regel optionele PO-snapshot (po_id, po_amount, ob_code, cb_code, …) zodat audits compleet zijn.
* `po_id`: regex `^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2,5}_…` (BIC-prefix gehandhaafd).
* `accounts.id` = IBAN; balance kan niet onder 0 (saldo-check vóór debiteren).

---

## 9. Process / planning

| Dag | Status | Belangrijkste resultaat |
|---|---|---|
| Dag 1 — analyse | ✅ | repo + Trello + 5 use cases gedocumenteerd |
| Dag 1 — design | ✅ | DB-schema, technologiekeuze (Node + MySQL) |
| Dag 2 — implementatie | ✅ | volledige API gebouwd, GUI gestart |
| Dag 3 — testing & integratie | ✅ | bearer-auth, polling, timeout, dual-DB; refactor naar single codebase |
| Dag 4 — eindpresentatie | ⏳ | morgen |

Repo: <https://github.com/Salah-91/pingfin-team20>
Trello: <https://trello.com/b/jJkcLHd8/pingfin>
