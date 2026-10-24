// Tests for `make zip`, the store upload (PUBLISHING.md §4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json")));

// The files in the ZIP `make zip` builds, by path.
function packaged() {
  const dist = mkdtempSync(join(tmpdir(), "tico-zip-"));
  try {
    execFileSync("make", ["-s", "zip", `DIST=${dist}`], { cwd: ROOT, stdio: "pipe" });
    const zip = join(dist, `tico-${manifest.version}.zip`);
    return new Set(execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter((f) => f && !f.endsWith("/")));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}

const files = packaged();

test("the ZIP has manifest.json at its top and no tests", () => {
  assert.ok(files.has("manifest.json"));
  for (const f of files) {
    assert.doesNotMatch(f, /_test\.js$|fake_chrome\.js$|^test\/|^node_modules\//, f);
  }
});

test("every file the manifest names is in the ZIP", () => {
  const named = [
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...manifest.content_scripts.flatMap((c) => c.js),
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const f of named) assert.ok(files.has(f), f);
});

// A page or module that loads a file left out would fail only once
// installed, so follow every import, script, stylesheet and image.
test("every file a packaged page or module loads is in the ZIP", () => {
  for (const f of files) {
    if (!/\.(js|html)$/.test(f)) continue;
    const text = readFileSync(join(ROOT, f), "utf8");
    const refs = [...text.matchAll(/(?:from\s+|import\s*\(\s*|\b(?:src|href)=)["'](\.{0,2}\/?[\w./-]+\.(?:js|css|html|png|svg))["']/g)].map((m) => m[1]);
    for (const ref of refs) {
      const path = ref.startsWith("/") ? ref.slice(1) : posix.normalize(posix.join(posix.dirname(f), ref));
      assert.ok(files.has(path), `${f} loads ${ref}, which isn't packaged`);
    }
  }
});
