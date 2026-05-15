import { defineConfig } from "wxt";

const spotifyMatches = ["https://open.spotify.com/*"];

export default defineConfig({
  srcDir: "src",
  browser: "chrome",
  targetBrowsers: ["chrome", "edge"],
  manifestVersion: 3,
  manifest: {
    name: "Spotify AI Blocker",
    description:
      "Chromium extension that automatically blocks AI-generated artists on Spotify using a community-maintained list.",
    permissions: ["storage", "contextMenus", "scripting", "tabs", "alarms"],
    host_permissions: [
      "https://open.spotify.com/*",
      "https://spclient.wg.spotify.com/*",
      "https://raw.githubusercontent.com/*",
    ],
    action: {
      default_title: "Spotify AI Artist Blocker",
      default_icon: {
        16: "/icon-16.png",
        48: "/icon-48.png",
        128: "/icon-128.png",
      },
    },
    icons: {
      16: "/icon-16.png",
      48: "/icon-48.png",
      128: "/icon-128.png",
    },
    web_accessible_resources: [
      {
        resources: ["page-script.js"],
        matches: spotifyMatches,
      },
    ],
  },
  zip: {
    artifactTemplate: "{{name}}-{{version}}-{{browser}}.zip",
    zipSources: false,
  },
});
