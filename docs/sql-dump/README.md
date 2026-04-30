# SQL Dump Folder

> Database-dumps voor de eindzip-deliverable.

## Hoe een dump maken

### Vereiste
Beide banken + database moeten draaien via Docker:

```powershell
docker compose up -d
```

### PowerShell (Windows)

```powershell
powershell -File scripts/dump-database.ps1
```

### Bash (Linux/macOS/Git Bash)

```bash
bash scripts/dump-database.sh
```

## Gegenereerde bestanden

Na het runnen vind je hier:

| Bestand | Inhoud |
|---|---|
| `pingfin_b1_dump.sql` | Schema + data van Bank 1 (CEKVBE88) |
| `pingfin_b2_dump.sql` | Schema + data van Bank 2 (HOMNBEB1) |
| `pingfin_full_dump.sql` | Beide databases gecombineerd |

## Schema vs dump

- **`pingfin_database.sql`** (in repo root) = leeg schema + initiële 20 accounts × €5000.
  Dit is wat Docker bij eerste opstart uitvoert.
- **dump-bestanden hier** = volledige snapshot inclusief alle PO's, ACK's, transactions
  en logs op het moment van de dump. Voor het verslag/zip-deliverable.

## Restore

```bash
# Op een verse MySQL:
docker exec -i pingfin-team20-db-1 mysql -u root -ppingfin_dev_password < pingfin_full_dump.sql
```
