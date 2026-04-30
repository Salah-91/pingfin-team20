# Dag 1 — Analyse, Planning & Design

> **Datum:** 27 april 2026
> **Team 20** — Salaheddine Sennouni, Abdallah Azouagh, Ayoub Abdeddoun, Marwan Saidi
> **Banken:** CEKVBE88 (Bank 1) & HOMNBEB1 (Bank 2)

---

## Ochtend — Analyse & Planning

### Taak A — Bestudeerd: SEPA messaging-flow

We hebben de manual doorgenomen en de 5 use cases uitgewerkt op een whiteboard:

| Use case | Scenario |
|---|---|
| **1** | OB-validatie faalt (bv. onbekende OA-account) → niets stroomt door |
| **2** | Interne betaling (zelfde bank) → directe atomische TX zonder CB |
| **3** | Externe betaling, OB OK, **CB-validatie faalt** (bv. onbekende BB-bank) |
| **4** | OB+CB OK, **BB-validatie faalt** (bv. onbekende BA-account) |
| **5** | Volledig succespad — OB → CB → BB → ACK terug |

**Afgesproken strategieën voor exceptions:**
- **Geen ACK binnen 1u** → automatische refund OA via timeout-monitor
- **CB onbereikbaar** → retry-job die elke minuut achterstallige ACK's opnieuw probeert te pushen

### Taak B — Repository setup

- GitHub repo aangemaakt: `https://github.com/Salah-91/pingfin-team20` (public — coach heeft read-access)
- Branch protection: `main` is default, push toegestaan voor team-leden
- `.gitignore` bevat `node_modules/`, `**/.env`, `*.log`, `.DS_Store`

### Taak C — Project management

- **Trello bord** met de volgende kaarten:
  - Validation & Handling
  - Error List
  - Test & Run
  - GUI end
  - Test (full integration)
  - End (rapport + presentatie)

**Werkverdeling:**
| Lid | Rol | Hoofdverantwoordelijkheid |
|---|---|---|
| Salah | Developer | Backend (Node + MySQL), API, jobs |
| Abdallah | Team Lead | Project management, Trello, integratie |
| Ayoub | Analyst | Database design, validatie-regels |
| Marwan | Developer | GUI, CSS, frontend integratie |

---

## Middag — Design & Simulatie

### Taak D — Postman simulatie

Voor we ook maar één regel code schreven hebben we de CB API getest met Postman:

1. **POST `/token`** met `{bic, secret_key}` → kreeg `access_token` (4u TTL)
2. **GET `/banks`** → lijst van geregistreerde banken
3. **POST `/banks`** met onze info → bank geregistreerd
4. **POST `/po_in`** met manueel JSON-PO → kreeg `cb_code: 2000` terug
5. **GET `/po_out`** → na enkele minuten verschenen onze test-PO's

**Conclusie van de simulatie:** elke POST verwacht `{"data": [...]}` als wrapper. Bearer-token is verplicht voor alle calls behalve `/token`.

### Taak E — Application design

**Tech stack vastgelegd:**

| Laag | Keuze | Reden |
|---|---|---|
| **Backend** | Node.js 20 + Express | snel om endpoints te scaffolden, async/await voor poll-jobs |
| **Database** | MySQL 8 | manual-conform (`pingfin_b1`, `pingfin_b2`); `decimal(12,2)` voor saldo |
| **HTTP client** | node-fetch | simpel, geen overhead voor onze use case |
| **Frontend** | Vanilla HTML/CSS/JS | geen framework — beperkte tijd, simple state |
| **Containerization** | Docker + docker-compose | reproduceerbare deployment, zelfs op Railway |
| **Deployment** | Railway (free tier) | gratis hosting met HTTPS, auto-deploy uit GitHub |

**Visuele model — flowchart van het systeem:**

```
                                ┌────────────────────┐
                                │   GUI (poort 8089/ │
                                │   8090, public/)   │
                                │   - dropdowns      │
                                │   - auto-poll 10s  │
                                │   - toast events   │
                                └─────────┬──────────┘
                                          │
                              REST /api/* │
                                          ▼
              ┌───────────────────────────────────────────────┐
              │  Express API                                  │
              │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
              │  │ routes/ │  │services/ │  │ jobs/      │  │
              │  │ - po    │  │- poIn    │  │ - poll-po  │  │
              │  │ - ack   │  │- poOut   │  │ - poll-ack │  │
              │  │ - auth  │  │- ackIn   │  │ - flush    │  │
              │  └─────────┘  └──────────┘  │ - timeout  │  │
              │                             └────────────┘  │
              └───────────────┬───────────────────────────────┘
                              │
                  ┌───────────┴────────┐
                  ▼                    ▼
            ┌─────────┐         ┌──────────────┐
            │ MySQL   │         │ stevenop.be/ │
            │ pingfin │         │ pingfin/v2   │
            │ _b1/_b2 │         │ (Clearing B) │
            └─────────┘         └──────────────┘
```

### Taak F — Database scaffolding

Tabellen (uit manual):
- `accounts` (PK: IBAN, balance)
- `po_new` (in te dienen PO's)
- `po_out` (verzonden PO's, status pending/processed/failed/timeout)
- `po_in` (ontvangen PO's)
- `ack_in` (ACK's terug van CB)
- `ack_out` (te versturen ACK's, sent_to_cb flag)
- `transactions` (audit trail per saldobeweging, signed amount)
- `logs` (alle events met PO-snapshot per regel)

20 accounts per bank gegenereerd, elk €5000 startsaldo (per manual).

---

## Deliverables Dag 1

- [x] Github repo public, coach has read-access
- [x] Trello bord met taken per categorie
- [x] Visueel model van messaging-flow
- [x] Database-scheme + 20 accounts × €5000
- [x] Postman screenshots van CB-simulatie
- [x] Word-rapport draft met titelpagina + intro

---

## Problemen Dag 1

| Probleem | Oplossing |
|---|---|
| BIC + secret_key contract niet onmiddellijk duidelijk | gevonden via `/token` endpoint test |
| Welk veld bevat het token in de response? | `data.token` — getest met meerdere paths |
| OneDrive sync wilde `node_modules` mee backuppen | toegevoegd aan `.gitignore`, OneDrive sync gepauzeerd voor de repo |
