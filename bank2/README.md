# Bank 2 — HOMNBEB1

## Gegevens

- BIC: HOMNBEB1

- Secret key: ebad6cbedc50a82b

- Railway project: (vul project URL in)

- DB Host: mysql.railway.internal

- DB Port: 3306

- DB User: root

- DB Name: railway

## Tabellen

Zelfde structuur als bank 1 (CEKVBE88):

accounts, po_new, po_out, po_in, ack_in, ack_out, transactions, log

## Token genereren

POST https://stevenop.be/pingfin/api/v2/token

Body: { "bic": "HOMNBEB1", "secret_key": "ebad6cbedc50a82b" }
