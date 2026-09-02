import { execFileSync } from "node:child_process";
import path from "node:path";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const errors = [];

for (const file of tracked) {
  const normalized = file.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);
  if (/secret/iu.test(basename) || /\.key$/iu.test(basename) || normalized.split("/").includes("private")) {
    errors.push(`${file} ressemble à un fichier secret`);
  }
}

for (const file of tracked.filter((name) => name.startsWith("data/"))) {
  const basename = path.posix.basename(file);
  if (basename !== "encrypted-data-public.json" && !/^[a-z0-9]+(?:-[a-z0-9]+)*-public\.json$/u.test(basename)) errors.push(`${file} n’utilise pas un nom public reconnu`);
}

if (errors.length) {
  console.error("Publication refusée :\n- " + [...new Set(errors)].join("\n- "));
  process.exit(1);
}

console.log("Aucun fichier secret ou original en clair détecté dans Git.");
