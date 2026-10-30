/* Run against localhost:3000 with a built frontend; all API requests go to an isolated test fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { prepareTestEnvironment } = require('./test-database.cjs');
prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const baseline = process.argv.includes('--baseline'), layoutOnly = process.argv.includes('--layout-only');
const root = path.resolve(__dirname, '../..');
const folder = path.join(root, '.test-artifacts', `ai-redesign-${baseline ? 'before' : 'after'}-${randomUUID()}`);
const cleanups = [], checks = [], errors = [], mutations = [];
let browser, web, socket, fixture, actorRole = 'ADMIN';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  await fs.mkdir(folder, { recursive: true });
  process.env.AI_STORAGE_ROOT = path.join(folder, 'storage');
  process.env.AI_MODEL_ROOT = path.join(folder, 'models');
  await fs.mkdir(path.join(process.env.AI_MODEL_ROOT, 'operational/m5-quantity-v2'), { recursive: true });
  for (const file of ['metadata.json', 'model.joblib']) await fs.copyFile(path.join(root, 'ml-service/models/operational/m5-quantity-v2', file), path.join(process.env.AI_MODEL_ROOT, 'operational/m5-quantity-v2', file));
  await fs.copyFile(path.join(root, 'ml-service/models/active-model.json'), path.join(process.env.AI_MODEL_ROOT, 'active-model.json'));
  fixture = await catalogFixture({ after: fn => cleanups.push(fn) });
  const facts = await require('./ai-business-fixture.cjs').businessFixture(fixture);
  const base = (await fixture.app.getUrl()).replace('127.0.0.1', 'localhost');
  let webReady = false;
  try { webReady = (await fetch('http://localhost:3000/login', {signal:AbortSignal.timeout(1000)})).ok; } catch { /* Start a frontend for this check. */ }
  if (!webReady) {
    web = spawn(process.execPath, [path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3000'], {cwd:path.join(root,'frontend'),env:process.env,windowsHide:true,stdio:'ignore'});
    for (let i=0;i<120;i++) { try { if ((await fetch('http://localhost:3000/login',{signal:AbortSignal.timeout(1000)})).ok) { webReady=true; break; } } catch { /* Starting. */ } await sleep(250); }
    assert.equal(webReady,true,'Frontend starts');
  }
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9236', `--user-data-dir=${path.join(folder, 'chrome')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let tab;
  for (let n = 0; n < 60; n++) {
    try { tab = await (await fetch('http://127.0.0.1:9236/json/new?about:blank', { method: 'PUT' })).json(); break; } catch { await sleep(250); }
  }
  assert.ok(tab, 'Chrome debugging endpoint');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { const request = pending.get(message.id); if (request) { pending.delete(message.id); if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result); } }
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/ai-center') && !['GET','OPTIONS'].includes(message.params.request.method)) mutations.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      const headers = Object.entries({ ...request.headers, Cookie: fixture.cookies[actorRole] }).map(([name, value]) => ({ name, value }));
      void send('Fetch.continueRequest', { requestId, url: base + url.pathname + url.search, headers }).catch(e => errors.push(e.message));
    }
  });
  const evaluate = async expression => { const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text); return value.result.value; };
  const until = async (expression, label, attempts = 200) => { for (let i = 0; i < attempts; i++) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(150); } throw Error(`${label}: ${await evaluate("document.body.innerText.slice(-2500)")}`); };
  const button = async text => { const expression = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`; await until(expression, text); await evaluate(`${expression}.click()`); };
  const fill = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const check = text => evaluate(`Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes(${JSON.stringify(text)})).querySelector('input[type=checkbox],input[type=radio]').click()`);
  const upload = async (selector, files) => { const doc = await send('DOM.getDocument'); const input = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector }); await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: files.map(file => path.join(root, 'datasets', file)) }); };
  const shot = async name => { const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(path.join(folder, `${name}.png`), Buffer.from(result.data, 'base64')); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http://localhost:3001/*', requestStage: 'Request' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  const [cookieName, cookieValue] = fixture.cookies.ADMIN.split('=');
  await send('Network.setCookie', { name: cookieName, value: cookieValue, url: 'http://localhost:3001', httpOnly: true, sameSite: 'Lax', path: '/' });
  await send('Page.navigate', {url:'http://localhost:3000/ai-center'});
  await until("!!document.querySelector('#ai-question')", 'AI Center loaded');
  if (baseline) {
    await shot('before-data');
    await evaluate("Array.from(document.querySelectorAll('.ai-workspace-nav button')).find(b=>b.textContent.includes('Trợ lý')).click()");
    await shot('before-chat');
    await fs.writeFile(path.join(folder,'baseline.json'), JSON.stringify({folder,errors}));
    console.log(JSON.stringify({folder,baseline:true})); return;
  }

  const aria = async label => { await until(`!!document.querySelector('button[aria-label=${JSON.stringify(label)}]:not(:disabled)')`,label); await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`); };
  const tool = async label => { await button('Công cụ'); await button(label); };
  const visible = selector => `document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().height>0`;
  const layout = async (width,name,selector) => { await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1050,deviceScaleFactor:1,mobile:width===390}); if(selector) await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`); else await evaluate('window.scrollTo(0,0)'); await sleep(200); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`No overflow at ${width}`); assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.ai-section,.ai-dashboard,.ai-analytics,.ai-chart')).filter(e=>e.getBoundingClientRect().width>0).filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(e=>({className:e.className,width:e.getBoundingClientRect().width}))"),[],`Containers stay in viewport at ${width}`); await shot(name); };
  assert.equal(await evaluate(visible('#ai-training')),false);
  assert.equal(await evaluate(visible('#ai-data')),true);
  assert.equal(await evaluate(visible('#ai-chat')),true);
  assert.equal(await evaluate("document.querySelectorAll('#ai-question').length"),1);
  await until("document.querySelector('.ai-model-status')?.textContent.includes('Sẵn sàng')",'Qwen connected');
  await layout(1440,'home-desktop'); await layout(1280,'home-laptop'); await layout(390,'home-mobile');
  await fill('#ai-question','Nội dung đang soạn'); const beforeToggle=mutations.length;
  for (let i=0;i<2;i++) await evaluate("document.querySelector('[role=switch]').click()");
  await sleep(250); assert.equal(mutations.length,beforeToggle); assert.equal(await evaluate("document.querySelector('#ai-question').value"),'Nội dung đang soạn');
  await tool('Nguồn dữ liệu'); assert.equal(await evaluate("document.querySelector('#ai-tools-menu')===null"),true); assert.match(await evaluate("document.querySelector('.ai-chat-tool-panel').textContent"),/CSV huấn luyện không/); await aria('Đóng tùy chọn');
  await button('Công cụ'); await layout(390,'tools-mobile','.ai-composer');
  assert.equal(await evaluate("(()=>{const r=document.querySelector('#ai-tools-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"),true);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});
  assert.equal(await evaluate("document.activeElement.textContent"),'Lịch sử hội thoại');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  assert.equal(await evaluate("document.querySelector('#ai-tools-menu')===null&&document.activeElement.textContent==='Công cụ'"),true);
  await button('Công cụ'); await evaluate("document.querySelector('.ai-chat-header').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); assert.equal(await evaluate("document.querySelector('#ai-tools-menu')===null"),true);
  console.log('Checkpoint passed'); checks.push('Unified layout, single composer, local toggle retains draft without API mutations; keyboard/outside-click tools at 390px');
  await layout(1440,'home-ready'); await aria('Dataset mới');
  await fill('input[placeholder="Lịch sử bán hàng quý gần nhất"]','CSV redesign acceptance');
  await check('Dữ liệu ngoài hệ thống'); await check('Dữ liệu demo / mô phỏng'); await button('Tạo dataset');
  await until("!!document.querySelector('.ai-dropzone input')",'Dataset created');
  await upload('.ai-dropzone input',['ai-center/01-sales-history.csv','ai-center/02-product-catalog.csv','ai-center/03-opening-inventory.csv']);
  await until("document.querySelectorAll('.ai-file').length===3&&!document.querySelector('.ai-dropzone input').disabled",'Exact three sample CSVs staged');

  const staged=await fixture.prisma.aiDataset.findFirstOrThrow({where:{ownerId:fixture.ids.user[0]},include:{files:true}});
  const originalIds=staged.files.map(f=>f.id);
  const badFile=path.join(folder,'unsupported.csv'); await fs.writeFile(badFile,'title,author\nBook,Reader\n');
  { const doc=await send('DOM.getDocument'); const picker=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.ai-dropzone input'}); await send('DOM.setFileInputFiles',{nodeId:picker.nodeId,files:[badFile]}); }
  await until("document.querySelectorAll('.ai-file').length===4&&!document.querySelector('.ai-dropzone input').disabled",'Unsupported file staged');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Xác nhận sử dụng dữ liệu')).disabled"),true);
  const invalid=await fixture.prisma.aiDataset.findUniqueOrThrow({where:{id:staged.id},include:{files:{where:{removed:false}}}});
  assert.ok(invalid.files.some(f=>f.status==='UNSUPPORTED_DATASET')); assert.ok(originalIds.every(id=>invalid.files.some(f=>f.id===id)));
  await evaluate("Array.from(document.querySelectorAll('.ai-file')).find(f=>f.textContent.includes('unsupported.csv')).querySelector('.ai-danger').click()");
  await until("document.querySelectorAll('.ai-file').length===3&&!document.querySelector('.ai-dropzone input').disabled",'Invalid file removed alone');
  await upload('[aria-label="Thay thế 02-product-catalog.csv"]',['ai-center/02-product-catalog.csv']);
  await until("!document.querySelector('.ai-dropzone input').disabled&&!!document.querySelector('.ai-badge-ready')",'Catalog replaced and checked');
  const dataset=await fixture.prisma.aiDataset.findFirstOrThrow({where:{ownerId:fixture.ids.user[0]}});
  assert.equal(dataset.summary.salesRows,5040); assert.equal(dataset.summary.issueCount,0);
  assert.equal(await fixture.prisma.aiTrainingJob.count({where:{ownerId:fixture.ids.user[0]}}),0);
  await evaluate("document.querySelector('.ai-data-management').open=false"); await layout(1440,'dataset-ready','#ai-data');
  await button('Xác nhận sử dụng dữ liệu'); await until(visible('#ai-training'),'Confirm reveals workflow');
  assert.equal((await fixture.prisma.aiDataset.findUniqueOrThrow({where:{id:dataset.id}})).status,'PUBLISHED');
  assert.equal(await fixture.prisma.aiTrainingJob.count({where:{ownerId:fixture.ids.user[0]}}),0);
  await fill('[aria-label="Cách đánh giá"]','124');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Bắt đầu huấn luyện').disabled"),true);
  assert.match(await evaluate("document.querySelector('.ai-stepper').textContent"),/Thiếu lịch sử/);
  await button('Dùng chế độ 30 ngày');
  await evaluate("document.querySelector('.ai-run-config .ai-advanced').open=true"); await fill('input[min="20"]','20');
  await evaluate("document.querySelector('.ai-run-config .ai-advanced').open=false");
  await button('Bắt đầu huấn luyện'); await until("!!document.querySelector('.ai-job')",'Real training starts');
  const runningJob=await fixture.prisma.aiTrainingJob.findFirstOrThrow({where:{ownerId:fixture.ids.user[0]}}), mutationsBefore=mutations.length;
  await fill('#ai-question','Giữ nội dung trong lúc huấn luyện');
  await evaluate("document.querySelector('[role=switch]').click()"); await sleep(300);
  assert.equal(mutations.length,mutationsBefore); assert.equal(await evaluate(visible('#ai-training')),false); assert.equal(await evaluate(visible('#ai-chat')),true);
  assert.equal(await evaluate("document.querySelector('#ai-question').value"),'Giữ nội dung trong lúc huấn luyện');
  assert.notEqual((await fixture.prisma.aiTrainingJob.findUniqueOrThrow({where:{id:runningJob.id}})).status,'CANCELLED');
  let sessionId;
  if (!layoutOnly) {
  await tool('Phạm vi cửa hàng'); await fill('[aria-label="Phạm vi hội thoại"]',fixture.storeA.id); await aria('Đóng tùy chọn');
  await button('Doanh thu 7 ngày↗'); assert.equal(await evaluate("document.activeElement.id"),'ai-question');
  assert.equal(await fixture.prisma.aiChatMessage.count({where:{session:{ownerId:fixture.ids.user[0]}}}),0);
  await fill('#ai-question',`Doanh thu ngày ${facts.today} là bao nhiêu?`); await evaluate("document.querySelector('#ai-question').focus()"); await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});
  await until("document.querySelectorAll('.ai-message.assistant').length===1&&!document.querySelector('.ai-thinking')",'Scoped sales reply',1600);
  let saved=await fixture.prisma.aiChatMessage.findFirstOrThrow({where:{role:'ASSISTANT',session:{ownerId:fixture.ids.user[0]}},orderBy:{createdAt:'desc'}});
  assert.equal(saved.sources.find(s=>s.tool==='getSalesSummary').rows[0]['Doanh thu (VND)'],'100.00');
  assert.equal(await evaluate("document.querySelector('.ai-chat-empty')===null"),true); assert.equal(await evaluate("document.querySelector('.ai-source').open"),false);
  await evaluate("document.querySelector('.ai-source').open=true"); await layout(1440,'chat-source','#ai-chat');
  sessionId=saved.sessionId; const historyCount=await fixture.prisma.aiChatMessage.count({where:{sessionId}});
  await fill('#ai-question','Model dự báo hiện tại là gì?'); await aria('Gửi câu hỏi');
  await until("document.querySelectorAll('.ai-message.assistant').length===2&&!document.querySelector('.ai-thinking')",'Qwen model tool call',1600);
  saved=await fixture.prisma.aiChatMessage.findFirstOrThrow({where:{role:'ASSISTANT',sessionId},orderBy:{createdAt:'desc'}});
  assert.ok(saved.sources.some(s=>s.tool==='getModelStatus'));
  await fill('#ai-question','Doanh thu ngày 2024-01-01 là bao nhiêu?'); await aria('Gửi câu hỏi');
  await until("document.querySelectorAll('.ai-message.assistant').length===3&&!document.querySelector('.ai-thinking')",'No data response',1600);
  assert.match(await evaluate("document.querySelectorAll('.ai-message.assistant')[2].textContent"),/Không tìm thấy|Chưa có/);
  await layout(390,'chat-no-data-mobile','#ai-chat');
  const messages=await evaluate("document.querySelector('.ai-chat-log').textContent"), finalCount=await fixture.prisma.aiChatMessage.count({where:{sessionId}}), countBeforeToggle=mutations.length;
  await evaluate("document.querySelector('[role=switch]').click()"); await evaluate("document.querySelector('[role=switch]').click()"); await sleep(300);
  assert.equal(mutations.length,countBeforeToggle); assert.equal(await evaluate("document.querySelector('.ai-chat-log').textContent"),messages); assert.ok(finalCount>historyCount);
  await aria('Hội thoại mới'); await aria('Lịch sử hội thoại'); await fill('[aria-label="Hội thoại của tôi"]',sessionId);
  await until("document.querySelectorAll('.ai-message.assistant').length===3",'History restored');
  assert.equal(await fixture.prisma.aiChatMessage.count({where:{sessionId}}),finalCount);
  console.log('Checkpoint passed'); checks.push('Exact CSV publication and real LightGBM job; toggle during training changes no jobs; scoped sales, real Qwen model call, missing data and history preserved');
  }
  await evaluate("document.querySelector('[role=switch]').click()");
  await until("!!document.querySelector('.ai-job .ai-badge-completed')",'Training finished',1600);
  const training=await fixture.prisma.aiTrainingJob.findUniqueOrThrow({where:{id:runningJob.id}});
  assert.equal(training.status,'COMPLETED'); assert.ok(training.result.evaluation.test.LightGBM);
  assert.match(await evaluate("document.querySelector('.ai-step:last-child').textContent"),/Chưa đủ điều kiện/);
  assert.equal(await evaluate("document.querySelectorAll('.ai-step.done').length"),6);
  assert.equal(await evaluate("document.querySelector('.ai-analytics').open"),false);
  await fill('[aria-label="Đơn vị biểu đồ"]','KG'); await fill('[aria-label="Mô hình biểu đồ"]','LightGBM'); await fill('[aria-label="Cửa sổ biểu đồ"]','30');
  const metric=training.result.evaluation.test.LightGBM['30'].by_unit.KG.daily;
  assert.equal(await evaluate("document.querySelector('.ai-metric-cards>div:first-child strong').textContent"),(metric.wape*100).toLocaleString('vi-VN',{maximumFractionDigits:2})+'%');
  const expectedOrder=Object.entries(training.result.evaluation.test).sort((a,b)=>a[1]['30'].by_unit.KG.daily.wape-b[1]['30'].by_unit.KG.daily.wape).map(([name])=>name);
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.ai-bar-list>div>div:first-child>span')).map(e=>e.firstChild.textContent)"),expectedOrder);
  assert.match(await evaluate("document.querySelector('.ai-best-model').textContent"),/Thấp nhất kỳ test/);
  await evaluate("document.querySelector('.ai-run-config').open=false");
  await layout(1440,'training-desktop','.ai-dashboard'); await layout(1280,'training-laptop','.ai-dashboard'); await layout(390,'training-mobile','.ai-dashboard');
  await evaluate("document.querySelector('.ai-analytics').open=true");
  for(const name of ['calendar','density','errors','correlation','missing','importance']) {
    await fill('[aria-label="Phân tích chuyên sâu"]',name); await sleep(100);
    assert.equal(await evaluate("document.querySelector('.ai-analytics select').value"),name);
    await layout(390,`advanced-${name}-mobile`,'.ai-analytics');
  }
  await fill('[aria-label="Phân tích chuyên sâu"]','correlation'); await layout(1440,'correlation-desktop','.ai-analytics');
  await evaluate("document.querySelector('.ai-analytics [data-point]').focus()");
  assert.match(await evaluate("document.querySelector('.ai-analytics .ai-chart-tooltip').textContent"),/Lượng bán/);
  const active=JSON.parse(await fs.readFile(path.join(process.env.AI_MODEL_ROOT,'active-model.json'),'utf8')); assert.equal(active.model_version,'m5-quantity-v2');
  assert.equal(await fixture.prisma.sale.count({where:{createdBy:fixture.ids.user[0]}}),2);
  console.log('Checkpoint passed'); checks.push('Actual metric values unchanged; WAPE ranking accurate; stage status from events; one advanced chart at a time; responsive charts/tooltips at all three widths; active model unchanged');
  if (!layoutOnly) {
  await evaluate("document.querySelector('[role=switch]').click()"); await send('Page.reload'); await until("!!document.querySelector('#ai-question')",'Reload');
  assert.equal(await evaluate("document.querySelector('[role=switch]').checked"),false);
  await aria('Lịch sử hội thoại'); await fill('[aria-label="Hội thoại của tôi"]',sessionId); await until("document.querySelectorAll('.ai-message.assistant').length===3",'History after reload');
  actorRole='STORE_MANAGER'; await send('Page.navigate',{url:'http://localhost:3000/ai-center'}); await until("!!document.querySelector('#ai-question')",'Manager');
  assert.match(await evaluate("document.querySelector('.ai-model-status').textContent"),/Store A/);
  await button('Công cụ'); assert.equal(await evaluate("document.querySelector('#ai-tools-menu').textContent.includes('Phạm vi cửa hàng')"),false);
  await button('Lịch sử hội thoại'); assert.equal(await evaluate("document.querySelector('[aria-label=\"Hội thoại của tôi\"]').options.length"),1);
  assert.equal(await evaluate("fetch('http://localhost:3001/ai-center/chat/sessions/'+"+JSON.stringify(sessionId)+",{credentials:'include'}).then(r=>r.status)"),403);
  await aria('Đóng tùy chọn');
  await fill('#ai-question',`Doanh thu ngày ${facts.today} là bao nhiêu?`); await aria('Gửi câu hỏi');
  await until("document.querySelectorAll('.ai-message.assistant').length===1&&!document.querySelector('.ai-thinking')",'Manager scoped answer',1600);
  const saved=await fixture.prisma.aiChatMessage.findFirstOrThrow({where:{role:'ASSISTANT',session:{ownerId:fixture.ids.user[1]}},orderBy:{createdAt:'desc'}});
  assert.equal(saved.sources.find(s=>s.tool==='getSalesSummary').rows[0]['Doanh thu (VND)'],'100.00');
  actorRole='STAFF'; await send('Page.navigate',{url:'http://localhost:3000/ai-center'}); await until("location.pathname==='/sales'",'Staff denied');
  assert.equal(await evaluate("fetch('http://localhost:3001/ai-center/config',{credentials:'include'}).then(r=>r.status)"),403);
  console.log('Checkpoint passed'); checks.push('Visibility preference restored; private chat reload; manager scoped data and no scope switch; staff denied route/API');
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,layoutOnly,checks,errors,modelPreserved:true,applicationDatabaseChanged:false},null,2));
  console.log(JSON.stringify({folder,checks,passed:true}));

})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close(); if (browser) browser.kill(); if (web) web.kill();
  for (const cleanup of cleanups) await cleanup();
});
