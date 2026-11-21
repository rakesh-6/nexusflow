// Fills the development database with sample data (PRD §17.8). Run with
// `pnpm db:seed`; safe to run again. The data itself is in src/demo/sampleData.ts,
// which the online demo uses too.
import { prisma } from "../src/lib/prisma.ts";
import {
  removeSampleData,
  seedAcme,
  seedGlobex,
  setSamplePassword,
} from "../src/demo/sampleData.ts";

if (process.env["NODE_ENV"] === "production") {
  console.error("Refusing to seed: NODE_ENV is production.");
  process.exit(1);
}

const started = Date.now();
setSamplePassword("public");
await removeSampleData();
const acme = await seedAcme();
const globex = await seedGlobex();
console.log("Seed complete in", ((Date.now() - started) / 1000).toFixed(1), "s");
console.table({ "Acme Studio (acme)": acme, "Globex (globex)": globex });
await prisma.$disconnect();
