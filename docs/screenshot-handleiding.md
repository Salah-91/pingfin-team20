# Screenshot-handleiding voor de presentatie

> Welke screenshots moet je waar invoegen in **`PingFin-Team20-Presentation.pptx`**?

---

## Voorbereiding (5 min)

```powershell
# 1. Start beide banken lokaal
docker compose up --build

# 2. Open in browser:
#    Bank 1: http://localhost:8089
#    Bank 2: http://localhost:8090

# 3. Open een PowerShell terminal naast de browser
```

**Screenshot tool:** `Win + Shift + S` (Snipping Tool) of `PrtScn` toets.
**Tip:** zoom de browser naar 90% (`Ctrl + -`) zodat alle UI past in één screenshot.

---

## Slide-voor-slide screenshot-checklist

### Slide 16 — Demo stap 1 (Manuele PO)

**Wat in beeld:**
- Tab "➕ PO Aanmaken" actief
- "Manuele PO aanmaken" details geopend
- OA dropdown opengeklapt — toont jouw eigen accounts met saldo
- Andere velden ingevuld (BB dropdown, BA, bedrag €50)

**Hoe maken:**
1. localhost:8089 → "➕ PO Aanmaken"
2. Klik "✏️ Manuele PO aanmaken" om uit te klappen
3. Klik op OA dropdown → laat 'm openstaan
4. `Win+Shift+S` → selecteer hele formulier-blok

**In PowerPoint:** vervang het zwarte placeholder-vak rechts op slide 16

---

### Slide 17 — Demo stap 2 (PO_OUT met ACK)

**Wat in beeld:**
- Tab "📤 PO_OUT" actief
- Een rij met `cb_code: ✓ 2000` (groen badge), `bb_code: ✓ 2000` (groen badge), status `processed`
- Liefst ook een toast notification rechtsonder zichtbaar

**Hoe maken:**
1. Verstuur eerst een interne of externe PO (manueel of via generate)
2. Klik "Verwerk PO_NEW"
3. Wacht 30-60s
4. Ga naar "📤 PO_OUT" tab
5. Screenshot van de tabel-rij + toast

**Tip:** voor het beste resultaat doe een test waarbij Bank 1 → Bank 2 stuurt en allebei de browsers naast elkaar zet → één screenshot van beide GUIs.

---

### Slide 19 — Test suite (terminal output)

**Wat in beeld:**
- Terminal output van `npm test` met "RESULTAAT: 40 geslaagd / 0 gefaald"
- Liefst beide tests achter elkaar

**Hoe maken:**
```powershell
cd "Bank 1"
npm test            # 40 unit tests
npm run test:errors # 18 integration tests (vereist draaiende API)
```
Screenshot van de PowerShell met groene `RESULTAAT` regel.

**In PowerPoint:** voeg toe als 2e afbeelding op slide 19 of vervang de tekst.

---

### Slide 20 — Foutcodes (logs-tab)

**Wat in beeld:**
- Tab "📜 Logs" actief
- Filter dropdown op type `po_rejected`
- Tabel met meerdere rijen: 4002 / 4003 / 4101 / 4004 events

**Hoe maken:**
1. Run eerst de error-tests: `npm run test:errors` (dit genereert log-events)
2. localhost:8089 → "📜 Logs"
3. Filter dropdown → kies `po_rejected`
4. Screenshot

**Toevoegen aan slide 20:** als extra visueel bewijs.

---

### Slide 21 — Security headers (response check)

**Wat in beeld:**
- PowerShell output van `Invoke-WebRequest` met security headers zichtbaar

**Hoe maken (PowerShell):**
```powershell
$r = Invoke-WebRequest -Uri https://pingfin-team20-production.up.railway.app/api/info
$r.Headers | Format-Table -AutoSize
```
Screenshot van de output — moet `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` tonen.

**In PowerPoint:** toevoegen aan slide 21 als bewijs.

---

### Extra screenshots (optioneel)

| Voor | Welke slide | Wat |
|---|---|---|
| Dashboard met stats | 14 | localhost:8089 → 📊 Dashboard met 6 statistieken-kaarten |
| ACK_OUT met 1066+ rijen | 24 | localhost:8089 → 📨 ACK_OUT (toon "1066 rijen" teller) |
| Banks tab | 24 | localhost:8089 → 🏛️ Banks (toon 51 banken) |
| GitHub repo | 24 | screenshot van https://github.com/Salah-91/pingfin-team20 |
| Trello bord | 24 | screenshot Trello met afgevinkte kaarten |

---

## Hoe screenshots invoegen in PowerPoint

1. Open `docs/PingFin-Team20-Presentation.pptx` in **Microsoft PowerPoint** (of LibreOffice Impress)
2. Ga naar de slide
3. Klik op het zwarte placeholder-vak (`[ SCREENSHOT 1: ... ]`)
4. **Delete** het vak
5. **Invoegen → Afbeelding → Uit bestand** of **drag-and-drop** je screenshot
6. Resize zodat 'em past in dezelfde ruimte
7. Optioneel: `Right-click → Image format → Border` voor een witte/gouden rand

---

## Belangrijk vóór de presentatie

- **Test alle screenshots** een uur vóór de presentatie — soms verschijnen ze anders op een externe monitor
- **Zorg voor een offline backup** — alle screenshots in een aparte folder zodat je niet afhankelijk bent van Railway-uptime
- **Open de presentatie in PowerPoint Slideshow mode** (`F5`) om te checken hoe alles eruit ziet op fullscreen
