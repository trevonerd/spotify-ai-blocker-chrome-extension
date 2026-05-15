import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const requiredPermissions = ["storage", "contextMenus", "scripting", "tabs", "alarms"];
const requiredHosts = [
  "https://open.spotify.com/*",
  "https://spclient.wg.spotify.com/*",
  "https://raw.githubusercontent.com/*",
];

const targets = ["chrome-mv3", "edge-mv3"];

for (const target of targets) {
  const manifestPath = join(process.cwd(), ".output", target, "manifest.json");

  if (!existsSync(manifestPath)) {
    console.error(`Generated manifest not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  for (const permission of requiredPermissions) {
    if (!manifest.permissions?.includes(permission)) {
      console.error(`${target}: missing permission: ${permission}`);
      process.exit(1);
    }
  }

  for (const host of requiredHosts) {
    if (!manifest.host_permissions?.includes(host)) {
      console.error(`${target}: missing host permission: ${host}`);
      process.exit(1);
    }
  }

  if (manifest.manifest_version !== 3) {
    console.error(`${target}: expected manifest_version 3, got ${manifest.manifest_version}`);
    process.exit(1);
  }

  if (manifest.background?.service_worker !== "background.js") {
    console.error(`${target}: expected WXT background service worker at background.js`);
    process.exit(1);
  }

  if (manifest.action?.default_popup !== "popup.html") {
    console.error(`${target}: expected WXT popup at popup.html`);
    process.exit(1);
  }

  const hasSpotifyContentScript = manifest.content_scripts?.some((script) =>
    script.matches?.includes("https://open.spotify.com/*"),
  );
  if (!hasSpotifyContentScript) {
    console.error(`${target}: missing Spotify content script`);
    process.exit(1);
  }

  const exposesPageScript = manifest.web_accessible_resources?.some((resource) =>
    resource.resources?.includes("page-script.js"),
  );
  if (!exposesPageScript) {
    console.error(`${target}: page-script.js is not web-accessible`);
    process.exit(1);
  }
}

console.log("Generated Chrome and Edge manifests have the required WXT MV3 shape.");
