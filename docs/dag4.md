# Dag 4 — Presentatie & Reflectie

> **Datum:** 30 april 2026
> **Doel:** Eindpresentatie + retrospectie

---

## Ochtend — Voorbereiding presentatie

**Verdeling:**
- **Salah** → presentation script + demo-flow
- **Abdallah** → finale Word-rapport
- **Marwan** → laatste GUI-polish + screenshots
- **Ayoub** → reflection-sectie + lessons-learned

**Status check:**
- [x] Beide banken live op Railway (HTTP 200, < 500ms response)
- [x] **51 banken geregistreerd** bij de CB (volledig SEPA-netwerk zichtbaar)
- [x] 1066+ ACK's verstuurd = continu live verkeer
- [x] Test suite groen (40+18 tests)
- [x] Repo public op GitHub voor coach-access

---

## Presentatie-flow (30 min)

Zie [`docs/presentatie-script.md`](presentatie-script.md) voor de volledige tekst.

| Slot | Onderwerp | Wie | Tijd |
|---|---|---|---|
| 1 | Probleemstelling + scope | Salah | 3 min |
| 2 | Architectuur & tech stack | Marwan | 4 min |
| 3 | Code highlights (validatie, atomic TX, retry-job) | Ayoub | 5 min |
| 4 | Live demo: PO van Bank 1 → ander team → ACK terug | Salah | 7 min |
| 5 | Test-resultaten + foutcode coverage | Abdallah | 4 min |
| 6 | Difficulties + lessons learned | Abdallah | 4 min |
| 7 | Q&A | allen | 3 min |

---

## Reflectie

### Wat ging goed?

1. **Vroege CB-API simulatie** — dag 1 namiddag al gekeken naar de CB met Postman vóór één regel code geschreven. Dat heeft ons veel later debug-werk bespaard.
2. **Atomische DB-transacties** — vanaf dag 2 al `beginTransaction/rollback` gebruikt → geen enkele inconsistente state in productie.
3. **Background jobs in plaats van synchrone calls** — pollPoOut + flushAckOut maken het systeem veerkrachtig tegen netwerkproblemen.
4. **Test suite** — schrijven van `validate.test.js` op dag 3 hielp ons de IBAN-bug binnen 5 minuten te diagnosticeren.
5. **Live notifications in GUI** — auto-poll + toasts maakten debugging tijdens cross-team tests 10× sneller dan log-tail.

### Wat ging minder?

1. **OneDrive + git is een slechte combinatie** — sync-conflicten kostten ons een uur op dag 3 (folders die werden teruggezet vanuit cloud na een delete).
2. **Hardcoded fallbacks** zijn een anti-pattern — de hard-coded BIC-lijst (`GKCCBEBB`, `BBRUBEBB`, `AXABBE22`) genereerde 4004's omdat die banken niet meer bij de huidige CB geregistreerd waren.
3. **Silent error swallowing** — `.catch(() => {})` op meerdere plaatsen verbergde bugs die we pas op dag 3 ontdekten via cross-team tests.
4. **Te strikte validatie** — onze IBAN-regex accepteerde alleen Belgische 16-char IBANs. Andere teams (NL, DE, FR) kregen 4101 errors. Defensief programmeren met internationale standaarden is moeilijker dan eerst lijkt.
5. **Time pressure op dag 4** — bug-fixes liepen door tot in de presentatie-dag. Beter testen op dag 2 had dit voorkomen.

### Lessons learned

1. **Test cross-team early** — dag 3 was eigenlijk te laat. Vanaf dag 2 namiddag al een mini-integratie met één ander team had heel wat 4101 errors voorkomen.
2. **Defensief valideren** — verwacht niet dat andere systemen perfect het protocol volgen. Case-insensitive vergelijken, format-tolerantie inbouwen.
3. **Geen silent failures** — élke catch moet loggen, anders zie je je bugs niet.
4. **Atomische TX zijn niet optioneel bij geld** — heeft ons gered van saldo-inconsistenties tijdens crashes.
5. **Live observability** > "ik kijk wel achteraf in de logs". Toast notifications waren de single grootste productiviteits-boost in de laatste dag.
6. **Single source of truth** voor codes en validatie. `lib/validate.js` + `codes.js` worden door alle services geïmporteerd.
7. **Schoolprojecten in OneDrive zetten is een slecht idee** — git is je sync, OneDrive is een conflict-machine.

### Wat zouden we anders doen volgende keer?

- **Day 1 namiddag al een dummy-API live op Railway** zodat andere teams ons kunnen pingen vanaf dag 2 — geen lokaal-only ontwikkeling.
- **CI met automated tests bij elke push** — `npm test` triggeren via GitHub Actions zodat regressies meteen zichtbaar zijn.
- **Project niet in OneDrive** — apart in `~/code/` lokaal + git als enige sync.
- **Vroege contract tests** met de CB API om verschillen tussen teams te ontdekken.
- **API-versionering** vanaf het begin — `/api/v1/` zodat we breaking changes kunnen invoeren zonder andere teams te breken.

---

## Eindstand product

| Aspect | Status |
|---|---|
| Manual-conform protocol | ✅ alle 5 use cases gedekt |
| Beide banken online | ✅ Railway HTTPS, 24/7 |
| Achtergrond-jobs | ✅ 5 jobs draaien automatisch |
| Test coverage | ✅ 40 unit + 18 integration tests |
| GUI met live updates | ✅ auto-poll + toasts + dropdowns |
| Documentatie | ✅ 4 dag-rapporten + test-rapport + geld-flow + verslag |
| Security | ✅ Bearer-tokens, secrets in .env (git-ignored) |
| Reproduceerbaarheid | ✅ docker-compose, beide composes valid |

---

## Deliverables Dag 4

- [x] Eindpresentatie (PowerPoint)
- [x] Verslag-document afgewerkt (Word + markdown bijlagen)
- [x] Reflection-sectie geschreven
- [x] Repo + alle code op GitHub
- [x] Beide banken online op Railway
- [x] Toledo upload met zip-bundel
