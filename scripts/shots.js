// Captures each live demo in projects.json into assets/projects/<slug>.webp.
//
// Run by hand with `npm run shots` when a demo's interface changes. The output
// is committed, so the deployed page holds no runtime dependency on any of
// these apps being up — a demo going down costs the page nothing but freshness.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'projects');
const projects = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects.json'), 'utf8'));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2
  });

  for (const project of projects) {
    process.stdout.write(project.slug + ' … ');
    await page.goto(project.demo, { waitUntil: 'networkidle', timeout: 60000 });
    // Web fonts and first paint settle after network idle. Without this pause
    // the capture can catch a frame of fallback type or an empty canvas.
    await page.waitForTimeout(2500);

    // An app that opens on an onboarding overlay would otherwise be previewed
    // by its overlay. `dismiss` names the button that gets past it.
    if (project.dismiss) {
      const button = page.getByRole('button', { name: project.dismiss }).first();
      if (await button.count()) {
        await button.click();
        await page.waitForTimeout(2000);
      }
    }

    const png = await page.screenshot();
    const file = path.join(OUT, project.slug + '.webp');
    await sharp(png).resize({ width: 1600 }).webp({ quality: 80 }).toFile(file);
    console.log('wrote ' + path.relative(ROOT, file));
  }

  await browser.close();
}

main().catch(function (error) {
  console.error('Shots failed: ' + error.message);
  process.exit(1);
});
