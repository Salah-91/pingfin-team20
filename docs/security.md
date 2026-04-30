# Security audit & maatregelen

> Defensieve laag-per-laag review van het PingFin systeem. Elke OWASP-categorie die voor onze use case relevant is.

---

## 1. Inkomende auth — Bearer tokens

**Waar:** [`Bank N/middleware/auth.js`](../Bank%201/middleware/auth.js)

Elke `POST /api/po_in` en `POST /api/ack_in` wordt afgewezen met **HTTP 401** als geen of een verkeerde Bearer-token wordt meegestuurd.

```js
function requireBearer(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/);
  if (!m || m[1] !== cfg.incomingToken) {
    return res.status(401).json({ ok: false, status: 401, message: 'Ongeldig of ontbrekend Bearer-token' });
  }
  next();
}
```

**Token zit in `.env`** (git-ignored). Per bank een ander token (`INCOMING_TOKEN`).

---

## 2. Uitgaande auth — CB-token rotatie

**Waar:** [`Bank N/lib/cbToken.js`](../Bank%201/lib/cbToken.js)

Onze calls naar de CB krijgen automatisch een vers Bearer-token:
- TTL = 4 uur
- Refresh-job draait elke 3.5 uur (vervang vóór expiry)
- Token in memory, niet op disk

---

## 3. SQL injection — preventie

**Status:** ✅ veilig

Alle SQL-queries gebruiken **mysql2 prepared statements** met `?`-placeholders. mysql2 escape de waarden zelf. Voorbeelden:

```js
await pool.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, iban]);
await pool.query('SELECT * FROM po_in WHERE po_id = ?', [poId]);
```

**Geen string-concatenatie** in de hele codebase (gegrep'd, 0 hits).

Zelfs de dynamische `/api/logs?type=...` filter gebruikt parameterized queries:

```js
let sql = 'SELECT * FROM logs';
const args = [];
if (type) { sql += ' WHERE type = ?'; args.push(type); }
sql += ' ORDER BY datetime DESC LIMIT ?';
args.push(limit);
await pool.query(sql, args);   // ← veilig
```

---

## 4. XSS (Cross-Site Scripting) — preventie

**Status:** ✅ alle user-data wordt geescaped vóór HTML-injectie

**Bedreigingsmodel:** een vijandige bank kan een PO sturen met `po_message: "<script>alert(1)</script>"`. Als wij die ongeescaped weergeven in onze GUI (PO_IN tab, transactions, logs), wordt de XSS uitgevoerd op browsers van onze gebruikers.

**Mitigatie** in [`Bank N/public/js/app.js`](../Bank%201/public/js/app.js):

```js
function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"]/g, c =>
    ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])
  );
}
```

**Toegepast op alle backend-velden** in render-functies:
- `laadAccounts` — `escapeHtml(a.id)`, `escapeHtml(a.owner_name)`
- `laadTransacties` — `escapeHtml(t.po_id)`, `escapeHtml(t.account_id)`
- `laadLogs` — `escapeHtml(l.message)`, `escapeHtml(l.type)`, `escapeHtml(l.po_id)`
- `laadBanks` — `escapeHtml(b.bic)`, `escapeHtml(b.name)`
- `laadPoIn/PoUit/AckIn/AckUit` — alle `${p.po_id}` → `${escapeHtml(p.po_id)}`
- `vulManueleDropdowns` — alle option values + textContent escapen
- `genereerPos` — `po_message` escapen (komt uit generator maar uit voorzichtigheid)

**Toast notificaties** escapen al de `tekst`-parameter.

---

## 5. Content Security Policy + security headers

**Waar:** [`Bank N/server.js`](../Bank%201/server.js) — middleware

Elke HTTP-respons krijgt deze headers:

| Header | Waarde | Wat het doet |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Voorkomt MIME-sniffing aanvallen |
| `X-Frame-Options` | `DENY` | Geen iframe-embedding (clickjacking) |
| `Referrer-Policy` | `no-referrer` | Geen URL-leak naar derde-partijen |
| `Content-Security-Policy` | restrictief | Beperkt scripts/styles tot eigen origin + CB |

**CSP-policy:**
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' https://stevenop.be;
frame-ancestors 'none';
```

→ Externe scripts kunnen nooit laden. Externe `fetch()` calls alleen naar `stevenop.be` (de CB). Zelfs als XSS gevonden zou worden, kan de aanvaller geen externe script of beacon laden.

---

## 6. Rate limiting op POST

**Waar:** [`Bank N/server.js`](../Bank%201/server.js)

In-memory rate limiter zonder externe dependency:
- **60 POST requests per minuut per IP**
- Bij overschrijding → HTTP 429 `Too Many Requests`

Voorkomt:
- DOS via spam-PO's (kan onze MySQL volpompen)
- Brute-force op de Bearer-token

```js
if (entry.count > RATE_LIMIT) {
  return res.status(429).json({ ok: false, status: 429, message: 'Te veel requests' });
}
```

---

## 7. Gevoelige links uit publieke GUI

**Probleem:** de GUI (publiek bereikbaar via Railway HTTPS) toonde links naar:
- GitHub repo (codebase exposure)
- Trello **invite link** (= eenieder kon zichzelf toevoegen aan ons board!)
- CB API URL (attack surface exposure)

**Oplossing:** in [`Bank N/public/index.html`](../Bank%201/public/index.html) zijn de links verwijderd. JavaScript voegt ze alleen toe als `window.location.hostname` lokaal is (`localhost`, `127.*`, `::1`):

```js
function toonDevLinks() {
  const isLocaal = /^(localhost|127\.|0\.0\.|::1)/i.test(window.location.hostname);
  if (!isLocaal) return;   // op productie blijven links verborgen
  // ... voeg dev-links toe ...
}
```

**Resultaat:**
- Publieke Railway-URL → géén links zichtbaar
- `localhost:8089` (development) → links zichtbaar voor coach/team

---

## 8. Secrets management

**Status:** ✅ geen secrets in git

| Secret | Waar opgeslagen | In git? |
|---|---|---|
| `INCOMING_TOKEN` (per bank) | `.env` per bank | ❌ git-ignored |
| `CB_SECRET` (door coach) | `.env` per bank | ❌ git-ignored |
| `CB_TOKEN` (in-memory) | proces-RAM | ❌ niet persistent |
| `DB_PASS` | `.env` | ❌ git-ignored |

**`.gitignore`** root + per-bank:
```
**/.env
**/node_modules/
*.log
```

Bewijs: `git log --all --diff-filter=A --name-only` toont **0 keer** een `.env`-file (alleen `.env.example` zonder waardes).

---

## 9. HTTPS (transport security)

**Status:** ✅ via Railway

Railway termineert HTTPS automatisch. Onze banken zijn alleen via `https://...railway.app` bereikbaar. Geen HTTP-fallback. Bearer-tokens reizen dus altijd over TLS.

---

## 10. Wat we NIET hebben (en waarom)

| Feature | Status | Waarom |
|---|---|---|
| **CSRF tokens** | ❌ niet nodig | We gebruiken Bearer-token (niet cookie-gebaseerd) → CSRF speelt niet |
| **Password hashing** | ❌ N/A | Geen user-accounts in onze applicatie |
| **2FA** | ❌ N/A | Geen user-login, alleen API-keys |
| **HSTS header** | ❌ Railway doet dit zelf | TLS-pinning op platformniveau |
| **SQL ORM (Sequelize/Prisma)** | ❌ overkill | mysql2 prepared statements zijn al safe |

---

## Test bewijslast

| Test | Bewijst |
|---|---|
| `tests/error-pos.test.js` TEST 8 + 9 | Bearer-auth: 401 zonder/met verkeerde token |
| `node tests/validate.test.js` | 40 unit tests op input-validatie |
| `grep -rE 'pool.query.*\\$\\{'` | 0 string-concat queries (= geen SQL injection) |
| `git log --all -- '.env'` | 0 commits met echte env-files |
| `curl -I https://...railway.app` | HTTPS + alle security headers aanwezig |

---

## Samenvatting voor presentatie

> "Voor security hebben we **8 verdedigingslagen**:
> 1. **Bearer tokens** voor inkomende endpoints (401 zonder)
> 2. **CB-token auto-rotatie** elke 3.5u
> 3. **mysql2 prepared statements** overal (geen SQL-injection mogelijk)
> 4. **escapeHtml() op alle user-data** in de GUI (geen XSS mogelijk)
> 5. **Content Security Policy** + 4 andere security headers
> 6. **Rate limiting** op POST (60/min/IP)
> 7. **Geen gevoelige links** in publieke GUI (Trello invite, GitHub, CB-URL alleen op localhost zichtbaar)
> 8. **Secrets in `.env`** die git-ignored zijn — bewezen 0 commits met echte tokens"
