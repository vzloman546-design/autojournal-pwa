const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function screenshot(page, info, name) {
  await expect(page.locator('.toast')).toHaveCount(0);
  const directory = process.env.QA_OUTPUT_DIR || info.outputDir;
  await fs.mkdir(directory, {recursive: true});
  await page.screenshot({path: path.join(directory, `${info.project.name}-${name}.png`), scale: 'css'});
}

async function fillCar(page, model = 'Corolla') {
  for (const [id, value] of Object.entries({make:'Toyota', model, year:'2020', engine:'1.6', plate:'А123ВС', vin:'JTDBR32E000012345', initialOdometer:'100000', currentOdometer:'120000', purchaseDate:'2024-01-31', purchasePrice:'1500000.50'})) {
    await page.locator('#' + id).fill(value);
  }
}

async function addCar(page, model = 'Corolla') {
  await page.locator('[data-action="add-car"]').click();
  await fillCar(page, model);
  await page.locator('button[form="car-form"]').tap();
  await expect(page.locator('#car-form')).toHaveCount(0);
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota ' + model);
}

async function checkShell(page) {
  const box = await page.evaluate(() => {
    const nav = document.querySelector('.tabbar-wrap').getBoundingClientRect();
    const main = document.querySelector('.main-scroll').getBoundingClientRect();
    const header = getComputedStyle(document.querySelector('.topbar'));
    const button = getComputedStyle(document.querySelector('.topbar .icon-btn'));
    return {bottom:nav.bottom, top:nav.top, mainBottom:main.bottom, height:innerHeight, width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
      background:header.backgroundColor, image:header.backgroundImage, filter:header.filter, blur:header.backdropFilter || header.webkitBackdropFilter, buttonBlur:button.backdropFilter || button.webkitBackdropFilter};
  });
  expect(Math.abs(box.bottom - box.height)).toBeLessThan(1);
  expect(Math.abs(box.mainBottom - box.top)).toBeLessThan(1);
  expect(box.scrollWidth).toBeLessThanOrEqual(box.width);
  expect(box.background).toMatch(/^rgb\(/);
  expect(box.image).toBe('none');
  expect(box.filter).toBe('none');
  expect(box.blur).toBe('none');
  expect(box.buttonBlur).toBe('none');
}

async function checkFields(page) {
  await expect(page.locator('.sheet .input').first()).toBeVisible();
  const fields = await page.locator('.sheet .input').evaluateAll(inputs => inputs.map(input => {
    const rect = input.getBoundingClientRect();
    const parent = input.parentElement.getBoundingClientRect();
    const sheet = input.closest('.sheet').getBoundingClientRect();
    return {id:input.id, type:input.getAttribute('type'), width:rect.width, parentWidth:parent.width, left:rect.left, right:rect.right, sheetLeft:sheet.left, sheetRight:sheet.right};
  }));
  expect(fields.some(f => f.type === 'date')).toBe(true);
  for (const field of fields) {
    expect(Math.abs(field.width - field.parentWidth), field.id).toBeLessThan(1);
    expect(field.left, field.id).toBeGreaterThanOrEqual(field.sheetLeft + 15);
    expect(field.right, field.id).toBeLessThanOrEqual(field.sheetRight - 15);
  }
}

test.beforeEach(async ({page}) => {
  await page.goto('./');
  await expect(page.locator('.topbar')).toBeVisible();
});

for (const [width, height] of [[320,568], [390,844], [430,932], [844,390]]) {
  test(`layout and dates at ${width}x${height}`, async ({page}, info) => {
    await page.setViewportSize({width, height});
    await checkShell(page);
    await screenshot(page, info, `empty-${width}`);
    await page.locator('[data-action="add-car"]').click();
    await checkFields(page);
    await fillCar(page);
    await checkFields(page);
    await page.locator('#purchaseDate').scrollIntoViewIfNeeded();
    await screenshot(page, info, `car-form-${width}`);
    await page.locator('button[form="car-form"]').tap();
    await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla');
    for (const view of ['history','parts','expenses','more','home']) {
      await page.locator(`.tabbar [data-view="${view}"]`).tap();
      await checkShell(page);
    }
    await page.locator('.main-scroll').evaluate(el => {el.scrollTop = el.scrollHeight;});
    await checkShell(page);
    await page.locator('.main-scroll').evaluate(el => {el.scrollTop = 0;});
    await screenshot(page, info, `home-${width}`);
  });
}

test('car creation, reload, edit and second vehicle', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await addCar(page);
  await page.reload();
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla');
  await page.locator('[data-action="car-switch"]').click();
  await page.locator('[data-action="edit-current-car"]').click();
  await expect(page.locator('#purchaseDate')).toHaveValue('2024-01-31');
  await expect(page.locator('#purchasePrice')).toHaveValue('1500000.5');
  await page.locator('#model').fill('Corolla Hybrid');
  await page.locator('button[form="car-form"]').tap();
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla Hybrid');
  await page.locator('[data-action="car-switch"]').click();
  await addCar(page, 'Yaris');
  await page.reload();
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Yaris');
  await page.locator('[data-action="car-switch"]').click();
  await expect(page.locator('[data-action="activate-car"]')).toHaveCount(2);
  await page.getByRole('button', {name:/Toyota Corolla Hybrid/}).click();
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla Hybrid');
  expect(errors).toEqual([]);
});

test('invalid vehicle can be corrected without losing fields', async ({page}) => {
  await page.locator('[data-action="add-car"]').click();
  await page.locator('button[form="car-form"]').tap();
  await expect(page.locator('#car-form')).toBeVisible();
  expect(await page.locator('#make').evaluate(el => el.validity.valueMissing)).toBe(true);
  await fillCar(page);
  await page.locator('#currentOdometer').fill('90000');
  await page.locator('button[form="car-form"]').tap();
  await expect(page.locator('.toast').last()).toContainText('Текущий пробег не может быть меньше');
  await expect(page.locator('#make')).toHaveValue('Toyota');
  await page.locator('#currentOdometer').fill('120000');
  await page.locator('button[form="car-form"]').tap();
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla');
});

test('storage error keeps the form and retry creates exactly one vehicle', async ({page}) => {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function(...args) {
      if (fail) {fail = false; throw new DOMException('Simulated full storage', 'QuotaExceededError');}
      return original.apply(this, args);
    };
  });
  await page.locator('[data-action="add-car"]').click();
  await fillCar(page);
  await page.locator('button[form="car-form"]').tap();
  await expect(page.locator('.toast').last()).toContainText('Не удалось сохранить');
  await expect(page.locator('#model')).toHaveValue('Corolla');
  await expect(page.locator('button[form="car-form"]')).toBeEnabled();
  await page.locator('button[form="car-form"]').tap();
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla');
  await page.reload();
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla');
  await page.locator('[data-action="car-switch"]').click();
  await expect(page.locator('[data-action="activate-car"]')).toHaveCount(1);
});

test('double tap during saving creates one vehicle', async ({page}) => {
  await page.route('**/db.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('export async function saveState(state) {', 'export async function saveState(state) { await new Promise(resolve => setTimeout(resolve, 600));');
    await route.fulfill({response, body});
  });
  await page.reload();
  await page.locator('[data-action="add-car"]').click();
  await fillCar(page);
  const button = page.locator('button[form="car-form"]');
  const box = await button.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(button).toBeDisabled();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla');
  await page.locator('[data-action="car-switch"]').click();
  await expect(page.locator('[data-action="activate-car"]')).toHaveCount(1);
});

test('date widths and saving in every affected form', async ({page}, info) => {
  await addCar(page);
  const flows = [
    {action:'add-entry', form:'entry-form', values:{title:'Плановое ТО'}},
    {action:'add-component', form:'component-form', values:{name:'Масляный фильтр'}},
    {action:'add-expense', form:'expense-form', values:{amount:'2500.50', description:'Заправка'}},
    {action:'add-document', form:'document-form', values:{title:'ОСАГО', issueDate:'2025-01-31', expiryDate:'2027-01-31'}},
    {action:'add-odometer', form:'odometer-form', values:{value:'120100'}}
  ];
  for (const flow of flows) {
    await page.locator(`[data-action="${flow.action}"]`).first().click();
    for (const [id,value] of Object.entries(flow.values)) await page.locator('#' + id).fill(value);
    await checkFields(page);
    await screenshot(page, info, flow.form);
    await page.locator(`button[form="${flow.form}"]`).tap();
    await expect(page.locator('#' + flow.form)).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator('.odo-number')).toContainText('120');
  await page.locator('.tabbar [data-view="history"]').tap();
  await expect(page.locator('.row-title').filter({hasText:'Плановое ТО'})).toBeVisible();
  await page.locator('[data-view="parts"]').tap();
  await expect(page.getByText('Масляный фильтр', {exact:true})).toBeVisible();
  await page.locator('[data-view="expenses"]').tap();
  await expect(page.getByText('Заправка', {exact:true})).toBeVisible();
  await page.locator('[data-view="more"]').tap();
  await page.locator('[data-view="documents"]').click();
  await expect(page.getByText('ОСАГО', {exact:true})).toBeVisible();
});

test('dark theme and viewport resize retain a solid header and anchored navigation', async ({page}, info) => {
  await addCar(page);
  await page.locator('[data-view="more"]').tap();
  await page.locator('[data-input="theme"]').selectOption('dark');
  await checkShell(page);
  await screenshot(page, info, 'dark-more');
  await page.setViewportSize({width:390, height:600});
  await checkShell(page);
  await page.setViewportSize({width:844, height:390});
  await checkShell(page);
  await screenshot(page, info, 'dark-landscape');
  await page.setViewportSize({width:390, height:844});
  await page.locator('[data-input="theme"]').selectOption('light');
  await checkShell(page);
});

test('safe area stays inside the bottom bar and keeps controls clear of the notch', async ({page, context, browserName}, info) => {
  test.skip(browserName !== 'chromium', 'CDP safe area emulation is only available in Chromium.');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {insets:{top:47, bottom:34, left:0, right:0}});
  await checkShell(page);
  const bar = await page.locator('.tabbar-wrap').boundingBox();
  const nav = await page.locator('.tabbar').boundingBox();
  expect(bar.y + bar.height - nav.y - nav.height).toBe(34);
  await screenshot(page, info, 'safe-area-portrait');
  await page.setViewportSize({width:844, height:390});
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {insets:{top:0, bottom:21, left:47, right:47}});
  await checkShell(page);
  const landscape = await page.locator('.tabbar').boundingBox();
  expect(landscape.x).toBeGreaterThanOrEqual(47);
  expect(landscape.x + landscape.width).toBeLessThanOrEqual(797);
  await screenshot(page, info, 'safe-area-landscape');
});

test('opaque viewport edges survive the shorter installed-app viewport', async ({page, context, browserName}, info) => {
  // This checks WebKit's edge-sampling inputs, not the native iOS scroll effect.
  // Without the legacy translucent status bar, iOS owns the top 47 CSS pixels.
  await page.setViewportSize({width:390, height:797});
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {insets:{top:0, bottom:34, left:0, right:0}});
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveCount(0);
  await addCar(page);
  for (const theme of ['dark', 'light']) {
    await page.locator('.tabbar [data-view="more"]').tap();
    await page.locator('[data-input="theme"]').selectOption(theme);
    await page.locator('.tabbar [data-view="home"]').tap();
    await expect(page.locator('.toast')).toHaveCount(0);
    for (const scrollTop of [1000, 0]) {
      await page.locator('.main-scroll').evaluate((el, top) => {el.scrollTop = top;}, scrollTop);
      await checkShell(page);
      const edges = await page.evaluate(() => {
        const top = document.elementFromPoint(innerWidth / 2, 4)?.closest('.topbar');
        const bottom = document.elementFromPoint(innerWidth / 2, innerHeight - 1)?.closest('.tabbar-wrap');
        return {
          topIsHeader: !!top,
          topPosition: top && getComputedStyle(top).position,
          topWidth: top?.getBoundingClientRect().width,
          topColor: top && getComputedStyle(top).backgroundColor,
          bottomIsNavigation: !!bottom,
          bottomColor: bottom && getComputedStyle(bottom).backgroundColor,
          canvasColor: getComputedStyle(document.documentElement).backgroundColor,
          bodyColor: getComputedStyle(document.body).backgroundColor,
          colorScheme: getComputedStyle(document.documentElement).colorScheme
        };
      });
      expect(edges.topIsHeader).toBe(true);
      expect(['sticky','fixed']).toContain(edges.topPosition);
      expect(edges.topWidth).toBe(390);
      expect(edges.topColor).toMatch(/^rgb\(/);
      expect(edges.bottomIsNavigation).toBe(true);
      expect(edges.canvasColor).toBe(edges.bottomColor);
      expect(edges.bodyColor).toBe(edges.bottomColor);
      expect(edges.colorScheme).toBe(theme);
    }
    await screenshot(page, info, `installed-viewport-${theme}`);
  }
});

test.describe('offline PWA', () => {
  test.use({serviceWorkers:'allow'});
  test('cached app reopens and saves a vehicle without a network', async ({page, context, browserName}) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit offline emulation fails before the service worker: https://github.com/microsoft/playwright/issues/42775');
    await addCar(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain('autojournal-v3.5.6');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla');
    await checkShell(page);
    await page.locator('[data-action="car-switch"]').click();
    await page.locator('[data-action="edit-current-car"]').click();
    await page.locator('#model').fill('Corolla Offline');
    await page.locator('button[form="car-form"]').tap();
    await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla Offline');
    await page.reload();
    await expect(page.locator('.vehicle-name')).toHaveText('Toyota Corolla Offline');
    await context.setOffline(false);
  });
});
