# Bank 2 — HOMNBEB1

## Gegevens

- BIC: HOMNBEB1
- Secret key: zie `.env` (nooit in README zetten — vraag de secret aan bij de docent of via Railway dashboard)
- Railway project: (vul project URL in)
- DB Host: zie `DB2_HOST` in `.env`

## Tabellen

Zelfde structuur als bank 1 (CEKVBE88):

accounts, po_new, po_out, po_in, ack_in, ack_out, transactions, logs

## Token genereren

```bash
curl -X POST https://stevenop.be/pingfin/api/v2/token \
  -H "Content-Type: application/json" \
  -d '{"bic": "HOMNBEB1", "secret_key": "<CB_SECRET2 uit .env>"}'
```

Zet het teruggegeven token in `CB_TOKEN2` in je `.env`.

## Starten

```bash
cp .env.example .env
# Vul de waarden in .env in
npm install
npm start
```

## Endpoints

| Method | Path           | Beschrijving                         |
|--------|----------------|--------------------------------------|
| GET    | /              | Health check                         |
| GET    | /accounts      | Alle rekeningen                      |
| GET    | /po_in         | Inkomende betalingen                 |
| GET    | /po_out        | Uitgaande betalingen                 |
| POST   | /po_in         | Ontvang betaling van CB              |
| POST   | /ack_in        | Ontvang ACK van CB                   |
| GET    | /po_new/generate | Genereer POs automatisch           |
| POST   | /po_new/add    | Voeg POs toe aan staging             |
| GET    | /po_new/process | Verwerk staging POs                 |
| POST   | /po_new/manual  | Maak manuele PO aan                 |
