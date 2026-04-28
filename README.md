# PingFin – Dag 1 Voormiddag Verslag
**Datum:** 27 april 2026  
**Team:** 20 — Bank Team  
**BIC:** CEKVBE88  
**Coaches:** Rogier van der Linde & Polina Kozlova (HER 3 - 5306)  
**Teamleden:** Salaheddine Sennouni, Saidi Marwan, Azouagh Abdallah, Abdeddoun Ayoub

---

## Wat hebben we gedaan?

### ✅ Task B — GitHub Repository opzetten
- Repository aangemaakt: [Salah-91/pingfin-team20](https://github.com/Salah-91/pingfin-team20)
- Mappenstructuur aangemaakt: `api/`, `db/`, `gui/`, `docs/`
- Bestanden aangemaakt:
  - `api/server.js` — Express server met health check endpoint
  - `api/package.json` — dependencies: express, mysql2, dotenv, nodemon
  - `db/schema.sql` — volledige database met alle tabellen + 20 accounts à €5000
  - `.gitignore` — node_modules, .env, logs
  - `README.md` — projectinfo, teamleden, tech stack, mappenstructuur
- 8 commits op de `main` branch
- Alle teamleden als collaborator toegevoegd
- Branch strategy vastgelegd: `main` (productie), `dev` (ontwikkeling), `feature/*` (features)

### ✅ Task C — Project Management Board (Trello)
- Trello board aangemaakt: [PingFin Team 20](https://trello.com/b/jJkcLHd8/pingfin)
- Kolommen: To Do / Doing / In Review / Blocked / Done ✅
- Taken aangemaakt voor alle dag 1 deliverables (Task A t/m F)
- Taken verdeeld over teamleden

### ✅ Task A — Analyse General Messaging Scheme
- Volledige analyse van de messaging flow gedaan (5 use cases + 2 exceptions)
- Diagram aangemaakt met alle flows: OB → CB → BB en terugkerende ACK-flows
- Kleurcodering: blauw (POST), groen (validatie OK), rood (validatie FAILED), oranje (account verwerking)
- Gedetailleerd markdown document opgesteld: `Task_A_Messaging_Scheme_Analyse.md`

#### Use Cases gedocumenteerd:
| UC | Beschrijving | Resultaat |
|----|-------------|-----------|
| UC1 | OB-validatie faalt (bv. ERR_OA_UNKNOWN) | TX = REJECTED, PO killed bij OB |
| UC2 | Interne betaling (OB == BB) | Atomische TX: debit OA + credit BA, geen CB |
| UC3 | CB-validatie faalt (bv. ERR_BB_UNKNOWN) | ACK_OUT (error) naar OB, TX = REJECTED |
| UC4 | BB-validatie faalt (bv. ERR_BA_UNKNOWN) | ACK_OUT (error) via CB naar OB, TX = REJECTED |
| UC5 | Happy path — alles OK | OA gedebiteerd, BA gecrediteerd, TX = COMPLETED |

#### Exceptions gedocumenteerd:
| EX | Beschrijving | Strategie |
|----|-------------|-----------|
| EX1 | CB API down (timeout/5xx) | Retry met exponential backoff, ERR_TIMEOUT na 1u, hold vrijgegeven |
| EX2 | PO's blijven hangen in CB.PO_OUT of CB.ACK_OUT | Retry + TTL 1u + Dead-letter tabel voor manuele inspectie |

#### Validatieregels per actor:
- **OB:** 10 regels (po_id formaat, bedrag ≤500, IBAN/BIC formaat, saldo check)
- **CB:** 5 regels (ob_id/bb_id geregistreerd, bedrag hercheck, po_id prefix)
- **BB:** 4 regels (cb_code == OK, bb_id eigen BIC, ba_id bestaat, bedrag hercheck)

---

## Technologiekeuzes

| Component | Technologie | Reden |
|-----------|------------|-------|
| Backend API | Node.js + Express | Gevolgd in de PPT handleiding |
| Database | MySQL | Relationele data, transacties |
| Frontend | HTML/CSS/JS | Eenvoudig, geen framework nodig |
| Versiebeheer | Git + GitHub | Samenwerking team |
| Project mgmt | Trello | Kanban-stijl, eenvoudig |

---

## Database schema (overzicht)

Tabellen aangemaakt in `db/schema.sql`:

| Tabel | Beschrijving |
|-------|-------------|
| `accounts` | 20 rekeningen elk met €5000 beginsaldo |
| `po_in` | Inkomende Payment Orders |
| `po_out` | Uitgaande Payment Orders |
| `ack_in` | Inkomende acknowledgements |
| `ack_out` | Uitgaande acknowledgements |
| `transactions` | Verwerkte transacties |
| `logs` | Audit log van alle events |

---

## Open punten / To do namiddag

- [ ] Officiële error codes ophalen van `stevenop.be/pingfin/api/v2/errorcodes`
- [ ] Mermaid sequence diagrams toevoegen aan README
- [ ] Task D: Volledige payment cycle simuleren via de test CB API
- [ ] Task E: Applicatiedesign uitwerken (routes, middleware, GUI mockup)
- [ ] Task F: Database verder uitwerken (ERD diagram)
- [ ] Presentatie dag 1 namiddag voorbereiden

---

## Bewijsmateriaal

- GitHub repo: https://github.com/Salah-91/pingfin-team20
- Trello board: https://trello.com/b/jJkcLHd8/pingfin
- Messaging diagram: `docs/messaging_diagram.png`
- Analyse document: `docs/Task_A_Messaging_Scheme_Analyse.md`

---

*Verslag opgesteld op 27 april 2026 — PingFin Workshop Odisee*
