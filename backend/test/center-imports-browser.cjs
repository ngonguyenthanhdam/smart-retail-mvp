const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { prepareTestEnvironment } = require('./test-database.cjs');
prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const baseline = process.argv.includes('--baseline');
const layoutOnly = process.argv.includes('--layout-only');
const sourceOnly = process.argv.includes('--source-only');
const root = path.resolve(__dirname, '../..');
const folder = path.join(
  root,
  '.test-artifacts',
  `center-imports-${baseline ? 'before' : 'after'}-${randomUUID()}`,
);
const cleanups = [];
const checks = [];
const errors = [];
let browser;
let web;
let socket;
let fixture;
let actorRole = 'ADMIN';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await fs.mkdir(folder, { recursive: true });
  process.env.AI_STORAGE_ROOT = path.join(folder, 'storage');
  process.env.AI_MODEL_ROOT = path.join(folder, 'models');
  await fs.mkdir(path.join(process.env.AI_MODEL_ROOT, 'operational/m5-quantity-v2'), {
    recursive: true,
  });
  for (const file of ['metadata.json', 'model.joblib'])
    await fs.copyFile(
      path.join(root, 'ml-service/models/operational/m5-quantity-v2', file),
      path.join(process.env.AI_MODEL_ROOT, 'operational/m5-quantity-v2', file),
    );
  await fs.copyFile(
    path.join(root, 'ml-service/models/active-model.json'),
    path.join(process.env.AI_MODEL_ROOT, 'active-model.json'),
  );
  fixture = await catalogFixture({ after: (fn) => cleanups.push(fn) });
  const base = (await fixture.app.getUrl()).replace('127.0.0.1', 'localhost');
  let webReady = false;
  try {
    webReady = (await fetch('http://localhost:3000/login', { signal: AbortSignal.timeout(1000) }))
      .ok;
  } catch {}
  if (!webReady) {
    web = spawn(
      process.execPath,
      [
        path.join(root, 'frontend/node_modules/next/dist/bin/next'),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        '3000',
      ],
      { cwd: path.join(root, 'frontend'), env: process.env, windowsHide: true, stdio: 'ignore' },
    );
    for (let i = 0; i < 120; i++) {
      try {
        if (
          (await fetch('http://localhost:3000/login', { signal: AbortSignal.timeout(1000) })).ok
        ) {
          webReady = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
    assert.equal(webReady, true, 'Frontend starts');
  }
  browser = spawn(
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=9235',
      `--user-data-dir=${path.join(folder, 'chrome')}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let tab;
  for (let n = 0; n < 60; n++) {
    try {
      tab = await (
        await fetch('http://127.0.0.1:9235/json/new?about:blank', { method: 'PUT' })
      ).json();
      break;
    } catch {
      await sleep(250);
    }
  }
  assert.ok(tab, 'Chrome debugging endpoint');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        if (message.error) request.reject(Error(message.error.message));
        else request.resolve(message.result);
      }
    }
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      const headers = Object.entries({
        ...request.headers,
        Cookie: fixture.cookies[actorRole],
      }).map(([name, value]) => ({ name, value }));
      void send('Fetch.continueRequest', {
        requestId,
        url: base + url.pathname + url.search,
        headers,
      }).catch((e) => errors.push(e.message));
    }
  });
  const evaluate = async (expression) => {
    const value = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (value.exceptionDetails)
      throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  };
  const until = async (expression, label, attempts = 200) => {
    for (let i = 0; i < attempts; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(150);
    }
    throw Error(`${label}: ${await evaluate('document.body.innerText.slice(-2500)')}`);
  };
  const button = async (text) => {
    const expression = `Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)})&&!b.disabled)`;
    await until(expression, text);
    await evaluate(`${expression}.click()`);
  };
  const fill = (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
    );
  const check = (text) =>
    evaluate(
      `Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes(${JSON.stringify(text)})).querySelector('input[type=checkbox],input[type=radio]').click()`,
    );
  const upload = async (selector, files) => {
    const doc = await send('DOM.getDocument');
    const input = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    await send('DOM.setFileInputFiles', {
      nodeId: input.nodeId,
      files: files.map((file) => path.join(root, 'datasets', file)),
    });
  };
  const shot = async (name) => {
    const result = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await fs.writeFile(path.join(folder, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Fetch.enable', {
    patterns: [{ urlPattern: 'http://localhost:3001/*', requestStage: 'Request' }],
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const [cookieName, cookieValue] = fixture.cookies.ADMIN.split('=');
  await send('Network.setCookie', {
    name: cookieName,
    value: cookieValue,
    url: 'http://localhost:3001',
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
  });
  if (!sourceOnly) {
    await send('Page.navigate', { url: 'http://localhost:3000/imports' });
    await until("!!document.querySelector('#import-file')", 'Imports page');
    if (baseline) {
      assert.equal(await evaluate("document.querySelector('#import-file').multiple"), false);
      await upload('#import-file', ['chatbot-business/01-products.csv']);
      await button('Kiểm tra và xem trước');
      await until("!!document.querySelector('#import-review-title')", 'Preview dialog');
      assert.equal(
        await evaluate(
          "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Nhập các dòng hợp lệ').disabled",
        ),
        true,
      );
      await shot('imports-missing-prerequisites');
      checks.push({
        name: 'Original product CSV without category/units: confirm disabled, no successful rows',
        evidence: await evaluate("document.querySelector('.operation-dialog').innerText"),
      });
      await button('Hủy nhập');
      await until(
        "document.querySelector('.operation-dialog')?.textContent.includes('FAILED')",
        'Cancelled job',
      );
      await button('Đóng');
      assert.equal(
        await evaluate(
          "Array.from(document.querySelectorAll('button')).some(b=>/Xóa/.test(b.textContent))",
        ),
        false,
      );
      checks.push({ name: 'Cancelled job has no remove action; picker single-file only' });
    } else {
      const pickButton = async (name) => {
        const expression = `Array.from(document.querySelectorAll('.import-pick')).find(p=>p.querySelector('strong').textContent===${JSON.stringify(name)}).querySelector('button')`;
        await until(`${expression}&&!${expression}.disabled`, name);
        await evaluate(`${expression}.click()`);
        await until("!!document.querySelector('#import-review-title')", 'Review ' + name);
      };
      assert.equal(await evaluate("document.querySelector('#import-file').multiple"), true);
      await upload('#import-file', [
        'chatbot-business/01-products.csv',
        'chatbot-business/02-sales.csv',
        'chatbot-business/03-expenses.csv',
        'chatbot-business/04-opening-inventory.csv',
        'ai-center/03-opening-inventory.csv',
      ]);
      assert.equal(await evaluate("document.querySelectorAll('.import-pick').length"), 5);
      await button('Kiểm tra và xem trước');
      await until(
        "document.querySelector('.import-feedback')?.textContent.includes('4/5')",
        'Per-file validation',
      );
      assert.match(
        await evaluate("document.querySelector('.import-picked').innerText"),
        /AI Center/,
      );
      await pickButton('01-products.csv');
      assert.equal(
        await evaluate(
          "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Nhập các dòng hợp lệ').disabled",
        ),
        true,
      );
      assert.match(
        await evaluate("document.querySelector('.import-blocked').textContent"),
        /không có dòng hợp lệ/,
      );
      assert.match(
        await evaluate("document.querySelector('.import-errors').innerText"),
        /Không tìm thấy mã nhóm hàng hoặc đơn vị tính/,
      );
      await shot('imports-error-explained');
      if (layoutOnly) {
        assert.equal(
          await evaluate(
            "(()=>{const errors=document.querySelector('.import-errors'), next=document.querySelector('.operation-dialog .import-help');return errors.getBoundingClientRect().bottom<=next.getBoundingClientRect().top})()",
          ),
          true,
          'Error table must not overlap preview/actions',
        );
        await send('Emulation.setDeviceMetricsOverride', {
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await sleep(200);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
        await shot('imports-error-mobile');
        await fs.writeFile(
          path.join(folder, 'layout-result.json'),
          JSON.stringify(
            {
              passed: true,
              checks: [
                'Bounded error scrolling, no overlap with preview/actions',
                '390px dialog without page overflow',
              ],
              errors,
            },
            null,
            2,
          ),
        );
        console.log(JSON.stringify({ folder, layoutPassed: true }));
        return;
      }
      await button('Hủy nhập');
      await until(
        "document.querySelector('.operation-dialog')?.textContent.includes('Đã hủy')",
        'Cancelled',
      );
      await button('Xóa khỏi danh sách');
      await until("!document.querySelector('#import-review-title')", 'Dismissed');
      const cancelled = await fixture.prisma.importJob.findFirstOrThrow({
        where: { createdBy: fixture.ids.user[0], fileName: '01-products.csv' },
      });
      assert.ok(cancelled.dismissedAt);
      assert.equal(cancelled.successRows, 0);
      checks.push({
        name: 'Five files selected; four independent previews retained; incompatible AI CSV rejected; missing references visible; cancelled import removed without deleting metadata',
      });

      for (const code of ['SYN_STORE_01', 'SYN_STORE_02', 'SYN_STORE_03'])
        await fixture.fixture('location', {
          code,
          name: 'Cửa hàng mô phỏng ' + code.slice(-2),
          locationType: 'STORE',
          createdAt: new Date(),
        });
      await fixture.fixture('category', {
        code: 'SYN_DEMO',
        name: 'Sản phẩm mô phỏng',
        createdAt: new Date(),
      });
      for (const code of ['CAN', 'KG', 'PCS'])
        if (!(await fixture.prisma.unit.findUnique({ where: { code } })))
          await fixture.fixture('unit', { code, name: code });
      await upload('#import-file', ['chatbot-business/01-products.csv']);
      await button('Kiểm tra và xem trước');
      await until(
        "Array.from(document.querySelectorAll('.import-pick')).find(p=>p.querySelector('strong').textContent==='01-products.csv')?.textContent.includes('12 hợp lệ')",
        'Product file checked',
      );
      await pickButton('01-products.csv');
      await until(
        "document.querySelector('.import-counts')?.textContent.includes('12') && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Nhập các dòng hợp lệ')?.disabled",
        'Product preview repaired',
      );
      await button('Nhập các dòng hợp lệ');
      await until(
        "document.querySelector('.operation-dialog')?.textContent.includes('Đã nhập')",
        'Products committed',
      );
      const productRows = await fixture.prisma.product.findMany({
        where: {
          sku: {
            in: Array.from({ length: 12 }, (_, i) => `SYN_P${String(i + 1).padStart(2, '0')}`),
          },
        },
      });
      assert.equal(productRows.length, 12);
      fixture.ids.product.push(...productRows.map((p) => p.id));
      await button('Đóng');
      for (const [file, expected] of [
        ['02-sales.csv', 477],
        ['03-expenses.csv', 6],
        ['04-opening-inventory.csv', 36],
      ]) {
        await pickButton(file);
        await until(
          `document.querySelector('.import-counts').innerText.includes('${expected}') && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Nhập các dòng hợp lệ').disabled`,
          'Revalidated ' + file,
        );
        const before = await fixture.prisma.inventoryLot.count({
          where: { locationId: { in: fixture.ids.location } },
        });
        await button('Nhập các dòng hợp lệ');
        await until(
          "!Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Nhập các dòng hợp lệ')",
          'Committed ' + file,
        );
        if (file === '02-sales.csv')
          assert.equal(
            await fixture.prisma.inventoryLot.count({
              where: { locationId: { in: fixture.ids.location } },
            }),
            before,
          );
        await button('Đóng');
      }
      assert.equal(
        await fixture.prisma.sale.count({ where: { createdBy: fixture.ids.user[0] } }),
        42,
      );
      assert.equal(
        await fixture.prisma.expense.count({ where: { createdBy: fixture.ids.user[0] } }),
        6,
      );
      assert.equal(
        await fixture.prisma.inventoryLot.count({
          where: { locationId: { in: fixture.ids.location } },
        }),
        36,
      );
      checks.push({
        name: 'Exact operational CSVs import 12 products, 42 invoices / 477 lines, 6 expenses and 36 lots; dependent files revalidate without reupload; historical sales do not deduct inventory',
      });
      await shot('imports-completed-desktop');
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await evaluate('window.scrollTo(0,0)');
      await sleep(150);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
      await shot('imports-mobile');
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1050,
        deviceScaleFactor: 1,
        mobile: false,
      });
    }
  }
  await send('Page.navigate', { url: 'http://localhost:3000/ai-center' });
  await until(
    '!!document.querySelector(\'input[placeholder="Lịch sử bán hàng quý gần nhất"]\')',
    'Dataset form',
  );
  if (!baseline) await button('Dataset mới');
  await fill('input[placeholder="Lịch sử bán hàng quý gần nhất"]', 'CSV usability verification');
  if (sourceOnly) {
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Tạo dataset').disabled",
      ),
      true,
    );
    await check('Dữ liệu trong hệ thống');
  } else {
    await check('Dữ liệu ngoài hệ thống');
    await check('Dữ liệu demo / mô phỏng');
  }
  await button('Tạo dataset');
  await until("!!document.querySelector('.ai-dropzone input')", 'Dataset created');
  await upload('.ai-dropzone input', [
    'ai-center/01-sales-history.csv',
    'ai-center/02-product-catalog.csv',
    'ai-center/03-opening-inventory.csv',
  ]);
  await until(
    "document.querySelectorAll('.ai-file').length===3 && !document.querySelector('.ai-dropzone input').disabled",
    'Three staged files',
  );
  if (sourceOnly) {
    await until("!!document.querySelector('.ai-source-mismatch')", 'Internal source explained');
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Xác nhận sử dụng dữ liệu')).disabled",
      ),
      true,
    );
    await evaluate(
      "document.querySelector('.ai-source-mismatch').scrollIntoView({block:'center'})",
    );
    await shot('source-mismatch');
    const dataset = await fixture.prisma.aiDataset.findFirstOrThrow({
      where: { ownerId: fixture.ids.user[0] },
      include: { files: true },
    });
    const raw = dataset.files.map((f) => [f.id, f.sha256]);
    await button('Chuyển sang dữ liệu ngoài hệ thống và kiểm tra lại');
    await until(
      "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Xác nhận sử dụng dữ liệu')&&!b.disabled)",
      'Confirm unlocked',
    );
    const fixed = await fixture.prisma.aiDataset.findUniqueOrThrow({
      where: { id: dataset.id },
      include: { files: true },
    });
    assert.equal(fixed.external, true);
    assert.equal(fixed.synthetic, true);
    assert.equal(fixed.status, 'STAGING');
    assert.equal(fixed.summary.salesRows, 5040);
    assert.equal(fixed.summary.issueCount, 0);
    assert.deepEqual(
      fixed.files.map((f) => [f.id, f.sha256]),
      raw,
    );
    assert.equal(
      await fixture.prisma.aiTrainingJob.count({ where: { ownerId: fixture.ids.user[0] } }),
      0,
    );
    await shot('source-corrected');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await shot('source-corrected-mobile');
    await button('Xác nhận sử dụng dữ liệu');
    await until(
      "document.querySelector('[data-testid=training-workflow]').offsetHeight>0",
      'Explicit confirm navigates',
    );
    assert.equal(
      (await fixture.prisma.aiDataset.findUniqueOrThrow({ where: { id: dataset.id } })).status,
      'PUBLISHED',
    );
    assert.equal(
      await fixture.prisma.aiTrainingJob.count({ where: { ownerId: fixture.ids.user[0] } }),
      0,
    );
    assert.equal(errors.length, 0, JSON.stringify(errors));
    await fs.writeFile(
      path.join(folder, 'source-result.json'),
      JSON.stringify(
        {
          passed: true,
          rows: 5040,
          issues: 0,
          filesPreserved: true,
          noAutomaticTraining: true,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ folder, sourceCorrectionPassed: true }));
    return;
  }
  await button('Kiểm tra toàn bộ batch');
  await until(
    "document.querySelector('.ai-summary')?.textContent.includes('Đã vượt qua')",
    'Batch valid',
  );
  if (baseline) {
    await check('Tôi xác nhận nguồn');
    await button('Công bố dataset');
    await until("!!document.querySelector('.ai-badge-published')", 'Dataset published');
    await evaluate(
      "(()=>{const e=Array.from(document.querySelectorAll('select')).find(e=>Array.from(e.options).some(o=>o.value==='124'));e.value='124';e.dispatchEvent(new Event('change',{bubbles:true}));})()",
    );
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Bắt đầu huấn luyện').disabled",
      ),
      true,
    );
    await evaluate(
      "Array.from(document.querySelectorAll('h3')).find(e=>e.textContent.includes('5. Chọn')).scrollIntoView({block:'start'})",
    );
    await shot('training-124-disabled');
    checks.push({
      name: '140-day example passes batch; 124-day evaluation requires 308 days and blocks training',
    });
    await evaluate("document.querySelector('#ai-question').scrollIntoView({block:'center'})");
    await fill(
      '#ai-question',
      'Cho tôi biết doanh thu cửa hàng trong khoảng 2026-10-05 đến 2026-10-18',
    );
    assert.match(await evaluate("document.querySelector('#ai-question').value"), /2026-10-05/);
    await shot('chat-composer-below-fold');
    checks.push({
      name: 'Original chat accepts free text, but composer follows long fixed-height message pane',
    });
  } else {
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('.ai-summary details')).every(d=>!d.open)",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.ai-upload-receipt').textContent.includes('Đã tải lên 3 file')",
      ),
      true,
    );
    await shot('ai-data-compact');
    await button('Xác nhận sử dụng dữ liệu');
    await until(
      "document.querySelector('[data-testid=training-workflow]').offsetHeight>0",
      'Training tab',
    );
    assert.equal(
      await evaluate(
        "document.querySelector('[data-testid=training-workflow] input[type=checkbox]')===null",
      ),
      true,
    );
    assert.equal(
      await fixture.prisma.aiTrainingJob.count({ where: { ownerId: fixture.ids.user[0] } }),
      0,
      'Dataset confirmation never auto-starts training',
    );
    assert.equal(await evaluate("document.querySelector('.ai-advanced').open"), false);
    await fill('[aria-label="Cách đánh giá"]', '124');
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Bắt đầu huấn luyện').disabled",
      ),
      true,
    );
    await button('Dùng chế độ 30 ngày');
    await shot('training-simple-desktop');
    await button('Bắt đầu huấn luyện');
    await until("!!document.querySelector('.ai-job')", 'Training started');
    const area = async (text) => {
      await evaluate(
        `Array.from(document.querySelectorAll('.ai-workspace-nav a')).find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`,
      );
    };
    await area('Trợ lý kinh doanh');
    const store = await fixture.prisma.location.findUniqueOrThrow({
      where: { code: 'SYN_STORE_01' },
    });
    await evaluate(
      "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Công cụ').click()",
    );
    await button('Phạm vi cửa hàng');
    await fill('[aria-label="Phạm vi hội thoại"]', store.id);
    await button('Đóng tùy chọn');
    await button('Kiểm tra kết nối');
    await until(
      "document.querySelector('.ai-model-status')?.textContent.toLowerCase().includes('sẵn sàng')",
      'Ollama ready',
    );
    await button('Doanh thu 7 ngày↗');
    assert.equal(await evaluate('document.activeElement.id'), 'ai-question');
    assert.equal(
      await fixture.prisma.aiChatMessage.count({
        where: { session: { ownerId: fixture.ids.user[0] } },
      }),
      0,
    );
    await fill(
      '#ai-question',
      'Cho tôi biết tổng doanh thu bán hàng từ ngày 2026-10-05 đến ngày 2026-10-18.',
    );
    await button('Gửi câu hỏi');
    await until(
      "document.querySelectorAll('.ai-message.assistant').length===1",
      'Scoped CSV revenue answer',
      1600,
    );
    let saved = await fixture.prisma.aiChatMessage.findFirstOrThrow({
      where: { role: 'ASSISTANT', session: { ownerId: fixture.ids.user[0] } },
      orderBy: { createdAt: 'desc' },
    });
    const salesSource = saved.sources.find((s) => s.tool === 'getSalesSummary');
    assert.ok(salesSource);
    assert.equal(salesSource.rows[0]['Doanh thu (VND)'], '32233980.00');
    assert.equal(salesSource.availability.state, 'AVAILABLE');
    await shot('chat-scoped-csv-revenue');
    await until("!document.querySelector('.ai-thinking')", 'Revenue settled');
    await fill('#ai-question', 'Doanh thu ngày 2026-10-19 là bao nhiêu?');
    await button('Gửi câu hỏi');
    await until(
      "document.querySelectorAll('.ai-message.assistant').length===2 && !document.querySelector('.ai-thinking')",
      'Empty date explained',
      1600,
    );
    saved = await fixture.prisma.aiChatMessage.findFirstOrThrow({
      where: { role: 'ASSISTANT', session: { ownerId: fixture.ids.user[0] } },
      orderBy: { createdAt: 'desc' },
    });
    assert.match(saved.content, /Không tìm thấy/);
    assert.match(saved.content, /Không đủ căn cứ/);
    assert.equal(
      saved.sources.find((s) => s.tool === 'getSalesSummary').availability.lastDate,
      '2026-10-18',
    );
    assert.equal(
      await evaluate("Array.from(document.querySelectorAll('.ai-source')).every(d=>!d.open)"),
      true,
    );
    await shot('chat-no-records');
    await until("!document.querySelector('.ai-thinking')", 'Chat settled');
    await button('Hội thoại mới');
    await fill('#ai-question', 'Viết cho tôi một bài thơ về mặt trăng.');
    await button('Gửi câu hỏi');
    await until(
      "document.querySelectorAll('.ai-message.assistant').length===1 && !document.querySelector('.ai-thinking')",
      'Out of scope answer',
      1600,
    );
    saved = await fixture.prisma.aiChatMessage.findFirstOrThrow({
      where: { role: 'ASSISTANT', session: { ownerId: fixture.ids.user[0] } },
      orderBy: { createdAt: 'desc' },
    });
    assert.match(saved.content, /ngoài phạm vi/);
    assert.deepEqual(saved.sources, []);
    checks.push({
      name: 'Editable suggestions never send automatically; actual free-form query returns exact scoped revenue from imported CSV; real Qwen rejects unrelated poetry request',
    });
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await evaluate("document.querySelector('#ai-question').scrollIntoView({block:'center'})");
    await sleep(200);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await shot('chat-mobile');
    await area('Huấn luyện');
    await until(
      "!!document.querySelector('.ai-job .ai-badge-completed')",
      'Real LightGBM comparison complete',
      1600,
    );
    const training = await fixture.prisma.aiTrainingJob.findFirstOrThrow({
      where: { ownerId: fixture.ids.user[0] },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(training.status, 'COMPLETED');
    const active = JSON.parse(
      await fs.readFile(path.join(process.env.AI_MODEL_ROOT, 'active-model.json'), 'utf8'),
    );
    assert.equal(active.model_version, 'm5-quantity-v2');
    assert.equal(
      await fixture.prisma.sale.count({ where: { createdBy: fixture.ids.user[0] } }),
      42,
    );
    assert.equal(
      await fixture.prisma.inventoryLot.count({
        where: { locationId: { in: fixture.ids.location } },
      }),
      36,
    );
    await shot('training-mobile');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1050,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate("document.querySelector('.ai-dashboard').scrollIntoView({block:'start'})");
    await shot('training-results');
    assert.ok(training.result.eda.feature_diagnostics.by_unit.PCS.correlation.length > 0);
    await evaluate("document.querySelector('.ai-analytics').open=true");
    await fill('[aria-label="Phân tích chuyên sâu"]', 'correlation');
    await evaluate("document.querySelector('.ai-chart-grid').scrollIntoView({block:'start'})");
    await shot('training-heatmaps');
    assert.equal(
      await evaluate(
        'document.querySelectorAll(\'svg[aria-label="Tương quan đặc trưng"]\').length',
      ),
      1,
    );
    await fill('[aria-label="Đơn vị biểu đồ"]', 'KG');
    await shot('training-heatmaps-kg');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(200);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await shot('training-heatmaps-mobile');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1050,
      deviceScaleFactor: 1,
      mobile: false,
    });
    checks.push({
      name: 'Exact three AI CSVs validate/publish and train all three algorithms; 124-day block explained and repaired by one click; real result shown; active model and imported business rows unchanged; desktop/mobile layout',
    });
    actorRole = 'STORE_MANAGER';
    await send('Page.navigate', { url: 'http://localhost:3000/ai-center' });
    await until("!!document.querySelector('#ai-question')", 'Manager view');
    await area('Trợ lý kinh doanh');
    assert.match(
      await evaluate("document.querySelector('.ai-model-status').textContent"),
      /Store A/,
    );
    actorRole = 'STAFF';
    await send('Page.navigate', { url: 'http://localhost:3000/ai-center' });
    await until("location.pathname==='/sales'", 'Staff rejected');
    checks.push({ name: 'Manager store scope preserved and staff denied AI Center' });
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await fs.writeFile(
    path.join(folder, 'result.json'),
    JSON.stringify(
      { mode: baseline ? 'baseline' : 'fixed', checks, errors, applicationDatabaseChanged: false },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ folder, checks: checks.map((c) => c.name), errors }));
})()
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (socket) socket.close();
    if (browser) browser.kill();
    if (web) web.kill();
    if (fixture) {
      const jobs = await fixture.prisma.importJob.findMany({
        where: { createdBy: { in: fixture.ids.user } },
        select: { id: true },
      });
      fixture.ids.importJob.push(...jobs.map((j) => j.id));
    }
    for (const cleanup of cleanups) await cleanup();
  });
