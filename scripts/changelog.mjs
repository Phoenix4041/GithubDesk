import { execFileSync } from "node:child_process";

const [version, since] = process.argv.slice(2);

if (!version) {
  console.error("Usage: node scripts/changelog.mjs <version> [since-tag]");
  process.exit(2);
}

const SECTIONS = [
  { title: "Novedades", types: ["feat"] },
  { title: "Correcciones", types: ["fix"] },
  { title: "Rendimiento", types: ["perf"] },
  { title: "Seguridad", types: ["security"] },
  { title: "Mantenimiento", types: ["refactor", "chore", "build", "ci", "docs", "test", "style"] },
];

const range = since ? [`${since}..HEAD`] : [];
const log = execFileSync("git", ["log", ...range, "--reverse", "--format=%h%x09%s"], { encoding: "utf8" });
const pattern = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;

const grouped = new Map(SECTIONS.map((section) => [section.title, []]));
for (const line of log.split("\n").filter(Boolean)) {
  const [hash, subject] = line.split("\t");
  const match = pattern.exec(subject);
  if (!match) {
    continue;
  }
  const [, type, scope, breaking, description] = match;
  const section = SECTIONS.find((candidate) => candidate.types.includes(type));
  if (!section) {
    continue;
  }
  const label = scope ? `**${scope}**: ` : "";
  const warning = breaking ? " (cambio incompatible)" : "";
  grouped.get(section.title).push(`- ${label}${description}${warning} (${hash})`);
}

const date = new Date().toISOString().slice(0, 10);
const lines = [`## ${version} - ${date}`, ""];
for (const section of SECTIONS) {
  const entries = grouped.get(section.title);
  if (entries.length === 0) {
    continue;
  }
  lines.push(`### ${section.title}`, "", ...entries, "");
}
process.stdout.write(lines.join("\n"));
