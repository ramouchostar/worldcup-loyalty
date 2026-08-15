#!/usr/bin/env node
// Minimal chromium-cli-alike REPL for driving the worldcup-loyalty Next.js app
// in a headless container (no chromium-cli tool available in this environment).
//
// Usage:
//   node driver.mjs <<'EOF'
//   nav http://localhost:3000
//   wait-for text=Belchicken
//   screenshot home
//   console --errors
//   quit
//   EOF
//
// Commands:
//   nav <url>                       goto a URL
//   wait-for text=<substring>       wait until page contains visible text
//   wait-for <css selector>         wait until selector is attached+visible
//   screenshot [name]               save screenshots/<name-or-seq>.png, update screenshot.png symlink
//   screenshot-element <selector>   screenshot just that element
//   click <selector>                click first match
//   fill <selector> <value...>      fill an input (fires React onChange via real typing)
//   type <selector> <value...>      alias for fill
//   press <key>                     press a key on the focused element (e.g. Enter)
//   eval <js>                       page.evaluate(js) and print JSON result
//   console --errors                print captured console.error / pageerror entries so far
//   url                             print current URL
//   quit                            close browser and exit

import { chromium } from 'playwright-core';
import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';

const SESSION = process.env.DRIVER_SESSION || 'default';
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'sessions', SESSION);
const SHOT_DIR = path.join(DIR, 'screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleLog = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleLog.push(`[console.error] ${msg.text()}`);
});
page.on('pageerror', (err) => consoleLog.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => {
  consoleLog.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});
page.on('response', (res) => {
  if (res.status() >= 400) consoleLog.push(`[http ${res.status()}] ${res.url()}`);
});

let shotSeq = 0;

function log(...args) {
  console.log(...args);
}

async function waitFor(target) {
  if (target.startsWith('text=')) {
    const text = target.slice(5);
    await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
  } else {
    await page.locator(target).first().waitFor({ state: 'visible', timeout: 15000 });
  }
}

async function screenshot(name) {
  shotSeq += 1;
  const fname = `${name || String(shotSeq).padStart(3, '0')}.png`;
  const fpath = path.join(SHOT_DIR, fname);
  await page.screenshot({ path: fpath, fullPage: true });
  const linkPath = path.join(SHOT_DIR, 'screenshot.png');
  try { fs.unlinkSync(linkPath); } catch {}
  fs.symlinkSync(fname, linkPath);
  log(`saved ${fpath}`);
}

function splitArgs(line) {
  // command + rest-of-line (rest kept intact for selectors/values with spaces)
  const idx = line.indexOf(' ');
  if (idx === -1) return [line, ''];
  return [line.slice(0, idx), line.slice(idx + 1)];
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

for await (const raw of rl) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const [cmd, rest] = splitArgs(line);
  try {
    switch (cmd) {
      case 'nav': {
        await page.goto(rest, { waitUntil: 'domcontentloaded', timeout: 30000 });
        log(`navigated ${rest}`);
        break;
      }
      case 'wait-for': {
        await waitFor(rest);
        log(`found ${rest}`);
        break;
      }
      case 'screenshot': {
        await screenshot(rest);
        break;
      }
      case 'screenshot-element': {
        shotSeq += 1;
        const fname = `${String(shotSeq).padStart(3, '0')}.png`;
        const fpath = path.join(SHOT_DIR, fname);
        await page.locator(rest).first().screenshot({ path: fpath });
        log(`saved ${fpath}`);
        break;
      }
      case 'click': {
        await page.locator(rest).first().click({ timeout: 15000 });
        log(`clicked ${rest}`);
        break;
      }
      case 'fill':
      case 'type': {
        const sp = rest.indexOf(' ');
        const sel = sp === -1 ? rest : rest.slice(0, sp);
        const value = sp === -1 ? '' : rest.slice(sp + 1);
        await page.locator(sel).first().fill(value, { timeout: 15000 });
        log(`filled ${sel}`);
        break;
      }
      case 'press': {
        await page.keyboard.press(rest);
        log(`pressed ${rest}`);
        break;
      }
      case 'eval': {
        const result = await page.evaluate(rest);
        log(JSON.stringify(result));
        break;
      }
      case 'url': {
        log(page.url());
        break;
      }
      case 'console': {
        if (rest.includes('--errors')) {
          if (consoleLog.length === 0) log('(no console errors captured)');
          else consoleLog.forEach((l) => log(l));
        }
        break;
      }
      case 'quit': {
        await browser.close();
        process.exit(0);
      }
      default:
        log(`unknown command: ${cmd}`);
    }
  } catch (err) {
    log(`ERROR (${cmd}): ${err.message}`);
  }
}

await browser.close();
