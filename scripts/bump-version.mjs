import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const targets = [
  { file: "package.json", pattern: /("version":\s*")[^"]+(")/ },
  { file: "src-tauri/tauri.conf.json", pattern: /("version":\s*")[^"]+(")/ },
  { file: "src-tauri/Cargo.toml", pattern: /^(version\s*=\s*")[^"]+(")/m },
];

const version = process.argv[2];

if (!version || !VERSION_PATTERN.test(version)) {
  console.error("Usage: node scripts/bump-version.mjs <major.minor.patch>");
  process.exit(1);
}

for (const { file, pattern } of targets) {
  const path = resolve(file);
  const content = readFileSync(path, "utf8");
  if (!pattern.test(content)) {
    console.error(`No version found in ${file}`);
    process.exit(1);
  }
  writeFileSync(path, content.replace(pattern, `$1${version}$2`));
  console.log(`${file} -> ${version}`);
}

console.log(`Next: cargo check inside src-tauri to refresh Cargo.lock, then commit and tag v${version}`);
