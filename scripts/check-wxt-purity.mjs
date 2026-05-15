import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const forbiddenPaths = [
  "manifest.json",
  "vite.config.ts",
  "vite.config.js",
  "popup",
  "src/background.ts",
  "src/injector.ts",
  "src/page-script.ts",
  "dist",
  "icons",
];

const sourceRoots = ["src", "scripts", ".github"];
const sourceFileExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".md",
]);
const allowedChromeMentions = new Set(["CHANGELOG.md"]);
const chromeApiPattern =
  /\bchrome\.(action|alarms|contextMenus|i18n|notifications|permissions|runtime|scripting|storage|tabs|webNavigation|windows)\b/;

const failures = [];

for (const forbiddenPath of forbiddenPaths) {
  if (existsSync(join(root, forbiddenPath))) {
    failures.push(`Legacy path still exists: ${forbiddenPath}`);
  }
}

for (const file of walkSourceFiles(root)) {
  const rel = relative(root, file);
  if (rel === "scripts/check-wxt-purity.mjs") {
    continue;
  }

  const text = readFileSync(file, "utf8");

  if (!allowedChromeMentions.has(rel) && chromeApiPattern.test(text)) {
    failures.push(`Direct chrome.* API usage found in ${rel}`);
  }

  if (/crxjs|CRXJS/.test(text)) {
    failures.push(`CRXJS reference found in ${rel}`);
  }
}

if (failures.length > 0) {
  console.error("WXT purity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("WXT purity check passed.");

function walkSourceFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === ".output" || entry === ".wxt") {
      continue;
    }

    const fullPath = join(dir, entry);
    const rel = relative(root, fullPath);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (
        sourceRoots.some((sourceRoot) => rel === sourceRoot || rel.startsWith(`${sourceRoot}/`))
      ) {
        files.push(...walkSourceFiles(fullPath));
      }
      continue;
    }

    if (
      sourceRoots.some((sourceRoot) => rel.startsWith(`${sourceRoot}/`)) ||
      rel === "package.json" ||
      rel === "tsconfig.json" ||
      rel === "README.md" ||
      rel === "CHANGELOG.md" ||
      rel === "wxt.config.ts"
    ) {
      const extension = getExtension(entry);
      if (sourceFileExtensions.has(extension)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function getExtension(filename) {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index);
}
