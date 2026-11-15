// Run with `pnpm docs:openapi` after changing src/docs/openapi.ts.
import { writeFileSync } from "node:fs";
import { buildOpenApiDocument, OPENAPI_FILE } from "./openapi.ts";

writeFileSync(OPENAPI_FILE, JSON.stringify(buildOpenApiDocument(), null, 2) + "\n");
console.log(`Wrote ${OPENAPI_FILE}`);
