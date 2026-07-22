import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
await mkdir('_qa/ui', { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-webgpu-developer-features']
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const errorSet = new Set()
const recordError = value => {
  const text = String(value)
  if (!text.includes('Forced WebGPU error for QA')) errorSet.add(text)
}
page.on('pageerror', error => recordError(error.stack || error))
page.on('console', message => {
  if (message.type() === 'error') recordError(message.text())
})

const load = async (target, url) => {
  await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await target.waitForFunction(() => window.__LIGHTSTROKE__ || window.__LIGHTSTROKE_ERROR__, null, { timeout: 30000 })
}

await load(page, 'http://127.0.0.1:5199/')
await page.waitForTimeout(1400)
const guided = await page.evaluate(() => window.__LIGHTSTROKE__)
await page.screenshot({ path: '_qa/ui/playwright-guided.png' })

await page.locator('.ls-clear').click()
await page.mouse.move(80, 480)
await page.mouse.down()
for (const [x, y] of [[120,410],[165,360],[215,410],[270,500],[320,420]]) await page.mouse.move(x, y, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(320)
const drawn = await page.evaluate(() => window.__LIGHTSTROKE__)
await page.screenshot({ path: '_qa/ui/playwright-drawn.png' })

const cameraBefore = drawn.cameraPosition
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: 145, y: 430, id: 31 }, { x: 245, y: 430, id: 32 }]
})
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchMove',
  touchPoints: [{ x: 105, y: 390, id: 31 }, { x: 285, y: 470, id: 32 }]
})
await page.waitForTimeout(500)
const orbited = await page.evaluate(() => window.__LIGHTSTROKE__)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await page.screenshot({ path: '_qa/ui/playwright-orbited.png' })
await page.close({ runBeforeUnload: false })

const compactPage = await context.newPage()
await compactPage.setViewportSize({ width: 320, height: 568 })
await load(compactPage, 'http://127.0.0.1:5199/')
await compactPage.waitForTimeout(1200)
const compact = await compactPage.evaluate(() => window.__LIGHTSTROKE__)
await compactPage.screenshot({ path: '_qa/ui/playwright-320x568.png' })
await compactPage.close({ runBeforeUnload: false })

const baselinePage = await context.newPage()
await baselinePage.goto('http://127.0.0.1:5199/?baseline=1', { waitUntil: 'domcontentloaded' })
await baselinePage.waitForTimeout(1200)
await baselinePage.mouse.move(70, 300)
await baselinePage.mouse.down()
await baselinePage.mouse.move(250, 230, { steps: 12 })
await baselinePage.mouse.up()
await baselinePage.waitForTimeout(400)
const baseline = await baselinePage.evaluate(() => ({
  debug: window.__LIGHTSTROKE__,
  uiVisible: getComputedStyle(document.querySelector('#ui')).display !== 'none',
  productHidden: getComputedStyle(document.querySelector('.ls-ui')).display === 'none'
}))
await baselinePage.screenshot({ path: '_qa/ui/playwright-baseline.png' })
await baselinePage.close({ runBeforeUnload: false })

const errorPage = await context.newPage()
await errorPage.goto('http://127.0.0.1:5199/?forceError=1', { waitUntil: 'domcontentloaded' })
await errorPage.waitForTimeout(250)
const errorState = await errorPage.evaluate(() => ({
  hidden: document.querySelector('.ls-error').hidden,
  text: document.querySelector('.ls-error').innerText
}))
try { await errorPage.screenshot({ path: '_qa/ui/playwright-error.png' }) } catch {}

const report = { guided, drawn, cameraBefore, orbited, compact, baseline, errorState, errors: [...errorSet] }
await writeFile('_qa/ui/playwright-state.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
