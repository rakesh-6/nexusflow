# Restore from backup

Two ways back, newest first.

## A. Neon's restore window (recent mistakes, quickest)

Neon keeps recent history on the free plan. In the Neon console: Project →
Branches → `main` → **Restore** → pick a time just before the mistake. To look
first without changing anything, choose "Create a branch from this time" and
connect to that branch instead.

## B. The weekly encrypted backup (older mistakes)

1. GitHub → Actions → **Weekly backup** → the newest successful run → download
   the artifact `nexusflow-backup-…` (kept 7 days).
2. Decrypt it with the `BACKUP_PASSPHRASE` you saved:

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in backup.dump.enc -out backup.dump
   ```

3. Restore into a **new Neon branch** first (never straight over production):

   ```bash
   docker run --rm -v "$PWD:/w" postgres:17 pg_restore --no-owner --dbname "<new branch direct URL>" /w/backup.dump
   ```

4. Check the data on that branch (point a local `.env` `DATABASE_URL` at it and run `pnpm dev`).
5. When it looks right, switch Render's `DATABASE_URL` and `DIRECT_DATABASE_URL` to that branch.
6. Delete the decrypted `backup.dump` from your computer.
