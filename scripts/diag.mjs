import { chromium } from "playwright-core";
import fs from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

const netlog = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("unpkg") || u.endsWith(".jpg") || u.endsWith(".png") || u.includes("geojson"))
    netlog.push(`${r.status()} ${u.slice(0, 80)}`);
});
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text()); });

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => [...document.querySelectorAll("canvas")].some((c) => c.width > 200), { timeout: 25000 });

const client = await page.context().newCDPSession(page);
const shot = async (p) => {
  const { data } = await client.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(p, Buffer.from(data, "base64"));
};

await page.waitForTimeout(1500);
await shot("scripts/diag-early.png");

// inspect the three.js scene via the exposed globe instance
const scene = await page.evaluate(() => {
  const g = window.__globe;
  if (!g) return { exposed: false };
  const counts = {};
  g.scene().traverse((o) => { counts[o.type] = (counts[o.type] || 0) + 1; });
  return {
    exposed: true,
    polygonsData: (g.polygonsData() || []).length,
    sceneTypes: counts,
    pov: g.pointOfView(),
  };
});
console.log("SCENE:", JSON.stringify(scene));

await page.waitForTimeout(6000);
await shot("scripts/diag-ontario.png");
console.log("NET:", JSON.stringify(netlog, null, 2));
await browser.close();
