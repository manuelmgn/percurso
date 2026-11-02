# Restoring from a backup

Backups live in the `percursos-backups` volume, one directory per snapshot:
`backup_YYYYMMDD_HHMMSS/` containing `percursos.db` (SQLite snapshot),
`uploads/` (copied files) and `deployment.env`.

## 1. Stop the app

```sh
docker compose stop app backups
```

## 2. Restore the database

Copy the snapshot over the data volume (adjust `backup_...` to the snapshot):

```sh
docker run --rm -v percursos-data:/data -v percursos-backups:/backups \
  python:3.12-slim \
  sh -c "cp /backups/backup_20260101_030000/percursos.db /data/percursos.db"
```

## 3. Restore uploads

Same idea, merging into the uploads volume:

```sh
docker run --rm -v percursos-uploads:/uploads -v percursos-backups:/backups \
  python:3.12-slim \
  sh -c "cp -a /backups/backup_20260101_030000/uploads/. /uploads/"
```

## 4. Put the deployment secrets back

Each snapshot carries a `deployment.env` with the VAPID keys, VAPID subject
and `PERCURSOS_SECRET_KEY` that were in force when the backup ran (values are
double-quoted dotenv literals with `\n` escapes, so multi-line PEMs stay
single-line and parse with any dotenv tool). Restore those values into the
host `.env` before starting the stack:

- **VAPID keys** — existing push subscriptions are bound to these keys.
  Rotating them means every stored subscription is rejected (410) and push
  silently stops working for all users.
- **SECRET_KEY** — session tokens are not stored plaintext; they are
  verified against this key. Changing it invalidates every logged-in session.

Empty values in `deployment.env` simply mean push was disabled at the time.

## 5. Start again

```sh
docker compose up -d
```
