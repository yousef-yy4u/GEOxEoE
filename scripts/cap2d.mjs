import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const errors = [];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector("svg path", { timeout: 20000 });
const paths = await page.locator("svg path").count();
console.log("township paths:", paths);
await page.waitForTimeout(1200);
await page.screenshot({ path: "scripts/ontario-2d.png", fullPage: true });

// hover over the map area (pixel-based) to trigger the float
try {
  await page.mouse.move(430, 430);
  await page.waitForTimeout(150);
  await page.mouse.move(440, 440);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "scripts/ontario-hover.png" });
  console.log("hover shot ok");
} catch (e) { console.log("hover failed:", e.message.split("\n")[0]); }

// dark theme
await page.click('button[aria-label="Toggle theme"]', { force: true });
await page.waitForTimeout(900);
await page.screenshot({ path: "scripts/ontario-dark.png", fullPage: true });

console.log("JS_ERRORS:", errors.length ? JSON.stringify(errors.slice(0, 5)) : "none");
await browser.close();
