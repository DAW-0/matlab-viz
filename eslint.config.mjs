import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Flat configuration keeps the same TypeScript recommended rule family while
// removing ESLint 8's retired eslintrc/glob/rimraf dependency chain. Generated
// files and private validation profiles must never be linted as source.
export default defineConfig(
  { ignores: ["node_modules/**", "dist/**", "dist-test/**", ".tools/**", "out/**", "coverage/**"] },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: { "@typescript-eslint/no-explicit-any": "off" }
  }
);
