// ESLint finds likely bugs and bad patterns. This config applies the
// recommended TypeScript rules to every file in the repository.
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules/", "**/dist/", "**/coverage/", "**/src/generated/"]),
  tseslint.configs.recommended,
  {
    rules: {
      // Allow unused parameters that start with "_" (e.g. Express's `_next`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
]);
