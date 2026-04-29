# PingFin — Team 20

**Banken:** CEKVBE88 (Bank1) & HOMNBEB1 (Bank2)
**Workshop:** 27–30 april 2026 — Odisee
**Coaches:** Rogier van der Linde & Polina Kozlova
**Team:** Salaheddine Sennouni · Saidi Marwan · Azouagh Abdallah · Abdeddoun Ayoub

Sample CB: <https://stevenop.be/pingfin/api/v2>

---

## 1. Wat zit er in?

Eén Node.js/Express applicatie (`api/`) die zowel als **Bank1** als **Bank2** gestart kan worden — enkel de env-vars verschillen. Beide instances:

* implementeren alle manual-endpoints onder `/api/*`
* hosten zelf de GUI (`gui/`) op `/`
* draaien **drie achtergrondjobs**:
  1. CB-token auto-refresh (4u TTL → 3.5u interval)
  2. BB-poller `GET /po_out` elke 30s + `POST /ack_in` na verwerking
  3. OB-poller `GET /ack_out` elke 30s
  4. 1u-timeout-monitor voor outstanding po_out → refund OA

Eén MySQL-instance host **twee databases** (`pingfin_b1`, `pingfin_b2`); zo blijven de saldo's per bank gescheiden.

---

## 2. Folderstructuur

```
api/
├── server.js                # Express bootstrap + jobs.startAll()
├── config.js                # central env config (1 bron van waarheid)
├── codes.js                 # numerieke pingfin-codes (2000, 4001…4102)
├── db.js                    # mysql2 pool
├── routes/
│   ├── help.js              # /api/help
│   ├── info.js              # /api/info
│   ├── accounts.js          # /api/accounts[/:iban]
│   ├── banks.js             # /api/banks (cache van CB.banks)
│   ├── po.js                # PO-flow public endpoints + POST /po_in (Bearer)
│   ├── ack.js               # ACK reads + POST /ack_in (Bearer)
│   ├── misc.js              # /api/transactions, /api/logs
│   └── jobs.js              # /api/jobs/run/:name (manuele triggers)
├── middleware/
│   └── auth.js              # Bearer-token verificatie
├── lib/
│   ├── time.js              # YYYY-MM-DD HH:MM:SS helper
│   ├── validate.js          # BIC / IBAN / amount / po_id format checks
│   ├── log.js               # writeLog() naar logs-tabel met PO-snapshot
│   ├── cbToken.js           # CB-token fetch + 3.5u refresh
│   └── cbClient.js          # cb.banks/sendPos/fetchPos/sendAcks/fetchAcks
├── services/
│   ├── poInService.js       # BB-zijde: process inkomende PO
│   ├── poProcessor.js       # OB-zijde: verwerk PO_NEW
│   └── ackInService.js      # OB-zijde: verwerk inkomende ACK
└── jobs/
    ├── pollPoOut.js         # GET CB.po_out → process → POST CB.ack_in
    ├── pollAckOut.js        # GET CB.ack_out → verwerk lokaal
    ├── timeoutMonitor.js    # outstanding > 1u → refund
    └── index.js             # startAll() + manualRoutes
db/
└── init.sql                 # creëert beide databases + schema's + accounts
gui/
├── index.html               # SPA met bank-selector
├── nginx.conf               # reverse proxy /bank1/api & /bank2/api
└── js/app.js                # relatieve URLs (auto-detect localhost / nginx / prod)
docs/
├── api.md                   # endpoint-documentatie
└── dag3_testresultaten.md   # testverslag
```

---

## 3. Lokaal opstarten

```bash
# 1. Env-files maken
cp api/.env.bank1.example api/.env.bank1
cp api/.env.bank2.example api/.env.bank2
# Open elk bestand en vul de geheime waarden in:
#   - CB_SECRET    : secret_key per BIC (door coach geleverd)
#   - INCOMING_TOKEN : kies een sterk token per bank

# 2. Start alles via docker compose
docker compose up --build

# 3. Bezoek
#    http://localhost:8080  → GUI (nginx, kan tussen Bank1/Bank2 wisselen)
#    http://localhost:3000  → Bank1 API + GUI
#    http://localhost:3001  → Bank2 API + GUI
#    localhost:3306         → MySQL (pingfin_b1, pingfin_b2)
```

`docker compose up` voert eenmalig `db/init.sql` uit om beide databases + schema's + accounts aan te maken.

---

## 4. Deployment op Railway

1. Maak in het Railway-project drie services:
   * **MySQL** (Railway-template)
   * **bank1** (deze repo, env via `api/.env.bank1.example`)
   * **bank2** (deze repo, env via `api/.env.bank2.example`)
2. Voer `db/init.sql` éénmalig uit op de Railway-MySQL (Railway-CLI: `railway run mysql < db/init.sql`).
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
curl -X POST http://localhost:3000/api/po_new/manual \
  -H "Content-Type: application/json" \
  -d '{"oa_id":"BE68539007547034","ba_id":"BE99100200300001","bb_id":"HOMNBEB1","po_amount":50.00,"po_message":"E2E test"}'

curl http://localhost:3000/api/po_new/process
# → status PENDING, cb_code 2000

# Wacht 30s (BB-poller op Bank2 haalt PO op + stuurt ACK terug naar CB)
# Wacht nog 30s (OB-poller op Bank1 haalt ACK op uit CB)

curl http://localhost:3000/api/ack_in     # → bb_code 2000
curl http://localhost:3000/api/po_out     # → status processed
curl http://localhost:3001/api/po_in      # → bb_code 2000 (Bank2 zicht)
curl http://localhost:3001/api/accounts   # → BE99100200300001 saldo 5050.00
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
