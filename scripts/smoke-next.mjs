import { chromium } from "playwright-core";
import fs from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const errors = [];
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });

const report = {};
// globe.gl injects a rendered WebGL <canvas> into its container
await page.waitForFunction(
  () => [...document.querySelectorAll("canvas")].some((c) => c.width > 200 && c.height > 200),
  { timeout: 25000 },
);
report.canvasPresent = true;
// summary computed text
await page.waitForFunction(() => document.body.innerText.includes("Analysis summary"), { timeout: 15000 });
report.summaryShown = (await page.locator("text=strongest measured association").count()) > 0;
report.headerShown = (await page.locator("text=EOE × Environment").count()) > 0;
report.circleControls = await page.locator("button[aria-label]").count();
report.scatterCanvas = (await page.locator("#scatter-canvas canvas").count()) > 0;
report.placeholderFlag = (await page.locator("text=UI placeholder").count()) >= 0;

// let the intro fly-in run
await page.waitForTimeout(7500);

// print verification BEFORE screenshots (screenshots are best-effort: the globe
// renders continuously, which can stall readback under swiftshader)
console.log(JSON.stringify(report, null, 2));
console.log("JS_ERRORS:", errors.length ? JSON.stringify(errors, null, 2) : "none");

// CDP capture grabs the current frame immediately (Playwright's screenshot
// waits for the continuously-animating WebGL globe to be "stable" and stalls).
const client = await page.context().newCDPSession(page);
const shot = async (path) => {
  try {
    const { data } = await client.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path, Buffer.from(data, "base64"));
    console.log("shot ok:", path);
  } catch (e) {
    console.log("shot failed:", path, e.message.split("\n")[0]);
  }
};
await shot("scripts/atlas-light.png");
await page.click('button[aria-label="Toggle theme"]');
await page.waitForTimeout(1500);
report.darkApplied = await page.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark");
console.log("darkApplied:", report.darkApplied);
await shot("scripts/atlas-dark.png");

await browser.close();
process.exit(errors.length ? 1 : 0);
