#!/usr/bin/env node
/**
 * CI validation for causet-templates:
 * - registry.json parses and paths exist
 * - each template.json parses and causetFiles exist
 * - no file: npm dependencies (use published @causet/* packages)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let errors = 0;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  errors += 1;
}

function readJson(rel) {
  const abs = path.join(root, rel);
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    fail(`${rel}: ${err.message}`);
    return null;
  }
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const registry = readJson("registry.json");
if (registry) {
  if (!Array.isArray(registry.templates)) {
    fail("registry.json: templates must be an array");
  } else {
    const ids = new Set();
    for (const t of registry.templates) {
      if (!t.id) fail("registry entry missing id");
      if (ids.has(t.id)) fail(`duplicate registry id: ${t.id}`);
      ids.add(t.id);
      if (!t.path) fail(`registry entry ${t.id ?? "?"} missing path`);
      else if (!exists(t.path)) fail(`registry path missing: ${t.path}`);
      else if (!exists(path.join(t.path, "template.json"))) {
        fail(`${t.path}/template.json missing`);
      }
    }
  }
}

function walkPackageJson(dir, rel = "") {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules") continue;
    const abs = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      walkPackageJson(abs, relPath);
      continue;
    }
    if (name !== "package.json") continue;
    const pkg = readJson(relPath);
    if (!pkg?.dependencies) continue;
    for (const [dep, ver] of Object.entries(pkg.dependencies)) {
      if (typeof ver === "string" && ver.startsWith("file:")) {
        fail(`${relPath}: dependency ${dep} uses file: protocol — use npm version instead`);
      }
    }
  }
}

walkPackageJson(root);

for (const base of ["demos", "quickstarts"]) {
  const baseDir = path.join(root, base);
  if (!fs.existsSync(baseDir)) continue;
  for (const name of fs.readdirSync(baseDir)) {
    const templateDir = path.join(baseDir, name);
    if (!fs.statSync(templateDir).isDirectory()) continue;
    const rel = `${base}/${name}`;
    if (!exists(`${rel}/template.json`)) continue;
    const meta = readJson(`${rel}/template.json`);
    if (!meta) continue;
    if (meta.id && registry?.templates) {
      const reg = registry.templates.find((t) => t.path === rel);
      if (!reg) fail(`template.json at ${rel} has no registry.json entry (path=${rel})`);
      else if (reg.id !== meta.id) {
        fail(`${rel}: template.json id (${meta.id}) != registry id (${reg.id})`);
      }
    }
    for (const cf of meta.causetFiles ?? []) {
      if (!exists(path.join(rel, cf))) {
        fail(`${rel}: causetFile missing: ${cf}`);
      }
    }
    if (!exists(`${rel}/README.md`)) {
      fail(`${rel}/README.md missing`);
    }
    if (!exists(`${rel}/causet`)) {
      fail(`${rel}/causet/ missing`);
    }
  }
}

if (errors > 0) {
  console.error(`\nValidation failed with ${errors} error(s).`);
  process.exit(1);
}

console.log("Validation passed.");
