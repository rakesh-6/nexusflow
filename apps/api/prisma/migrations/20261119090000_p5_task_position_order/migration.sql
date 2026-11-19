-- Card order keys (fractional indexing, PRD §11.6.6) such as "Zz" < "a0" < "a0V"
-- must sort byte by byte. The database's language rules ignore upper and
-- lower case, so the column uses the "C" collation. Prisma cannot describe a
-- column collation, so this lives only here; the index is rebuilt automatically.
ALTER TABLE "Task" ALTER COLUMN "position" TYPE VARCHAR(64) COLLATE "C";
