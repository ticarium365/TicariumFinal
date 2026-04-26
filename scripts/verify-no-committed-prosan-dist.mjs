#!/usr/bin/env node
/**
 * Ensures no Vite build output under artifacts/prosan/dist is git-tracked.
 * Source of truth is TypeScript + Vite; production deploy must run `pnpm -C artifacts/prosan run build`.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

let out = "";
try {
  out = execSync("git ls-files -z -- artifacts/prosan/dist", {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
} catch {
  console.warn("verify-no-committed-prosan-dist: git ls-files failed — not a git checkout; skip");
  process.exit(0);
}

const files = out.split("\0").filter(Boolean);
if (files.length) {
  console.error("verify-no-committed-prosan-dist: FAILED — build output must not be committed.");
  console.error("Policy: build from source in CI/deploy; remove from index: git rm -r --cached artifacts/prosan/dist");
  for (const f of files) console.error("  tracked:", f);
  process.exit(1);
}

console.log("verify-no-committed-prosan-dist: OK (no tracked files under artifacts/prosan/dist)");
