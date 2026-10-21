/* ================= DairyCare – script.js =================
   1) Data & helpers   2) Navigation   3) Each feature (form + table)   4) Reports
   All data lives in one object `db` and is saved to localStorage. */

// ---------- 1. DATA & HELPERS ----------
const KEY = 'dairycare-data';
const $ = id => document.getElementById(id);                       // short for getElementById
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const money = n => '₹' + (+n).toFixed(2);
const sum = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); // prevents HTML injection
function dateOffset(daysAgo) { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10); }
const today = () => dateOffset(0);

// ==========================================
// ⚡ SUPABASE CLOUD DATABASE (CODE ONLY)
// ==========================================
// Enter your Supabase credentials here to store all data in PostgreSQL:
const SUPABASE_URL = 'https://dhbsgnfwnhhwuldxjumo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoYnNnbmZ3bmhod3VsZHhqdW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MDM0MzcsImV4cCI6MjEwODE3OTQzN30.IC0V1g9AkR2FdbE_drn7DomAQgZk4DVZu7dG1ObdC04';

let sbClient = null;
const cleanUrl = SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
if (typeof window.supabase !== 'undefined' && cleanUrl && SUPABASE_ANON_KEY) {
  try {
    sbClient = window.supabase.createClient(cleanUrl, SUPABASE_ANON_KEY);
    console.log('✅ Supabase connected in code.');
  } catch (err) {
    console.error('Supabase init error:', err);
  }
}

// Background sync helper: saves every create/update/delete directly to Supabase
async function syncRecord(table, record, isDelete = false) {
  if (!sbClient) return;
  try {
    if (isDelete) {
      await sbClient.from(table).delete().eq('id', record.id);
    } else {
      await sbClient.from(table).upsert(record);
    }
  } catch (err) {
    console.error(`Supabase cloud sync error on ${table}:`, err);
  }
}

// Automatically load latest cloud data on startup if Supabase is configured
async function loadFromSupabase() {
  if (!sbClient) return;
  try {
    const [{ data: f }, { data: c }, { data: s }, { data: p }, { data: e }] = await Promise.all([
      sbClient.from('farmers').select('*'),
      sbClient.from('collections').select('*'),
      sbClient.from('sales').select('*'),
      sbClient.from('payments').select('*'),
      sbClient.from('expenses').select('*')
    ]);
    if (f && f.length) {
      db.farmers = f;
      db.collections = c || [];
      db.sales = s || [];
      db.payments = p || [];
      db.expenses = e || [];
      save();
      render();
      console.log('✅ Synced data from Supabase cloud database!');
    } else if (db.farmers.length) {
      // Cloud is empty: auto-seed existing records to Supabase
      await Promise.all([
        sbClient.from('farmers').upsert(db.farmers),
        sbClient.from('collections').upsert(db.collections),
        sbClient.from('sales').upsert(db.sales),
        sbClient.from('payments').upsert(db.payments),
        sbClient.from('expenses').upsert(db.expenses)
      ]);
      console.log('✅ Initial records uploaded to Supabase!');
    }
  } catch (err) {
    console.error('Supabase sync error:', err);
  }
}

// Sample data shown the first time the app opens
function sampleData() {
  const d = { farmers: [], collections: [], sales: [], payments: [], expenses: [] };
  const names = [
    ['Ramesh Patil', '9876543210', 'Ashta', 'Cow'],
    ['Sunita Jadhav', '9822011223', 'Walwa', 'Buffalo'],
    ['Ganesh More', '9765432109', 'Islampur', 'Cow'],
    ['Lata Shinde', '9890123456', 'Ashta', 'Buffalo']
  ];
  names.forEach((n, i) => d.farmers.push({ id: 'f' + i, name: n[0], phone: n[1], village: n[2], milkType: n[3] }));
  const curMo = today().slice(0, 7);
  // Generate 10-day collection records for days 1 to 10 of current month
  for (let dayNum = 1; dayNum <= 10; dayNum++) {
    const dStr = `${curMo}-${String(dayNum).padStart(2, '0')}`;
    d.farmers.forEach((f, i) => ['Morning', 'Evening'].forEach((shift, s) => {
      const isBuf = f.milkType === 'Buffalo';
      const baseLitres = isBuf ? 12 : 14;
      const litres = baseLitres + ((i * 3 + dayNum * 2 + s * 4) % 6);
      const fat = isBuf ? +(6.1 + ((dayNum + i) % 4) * 0.1).toFixed(1) : +(3.7 + ((dayNum + i) % 4) * 0.1).toFixed(1);
      const snf = isBuf ? +(8.8 + ((dayNum + s) % 3) * 0.1).toFixed(1) : +(8.3 + ((dayNum + s) % 3) * 0.1).toFixed(1);
      const baseRate = isBuf ? 55 : 40;
      const rate = +(baseRate + (fat - (isBuf ? 6.5 : 4.0)) * 2.5 + (snf - (isBuf ? 9.0 : 8.5)) * 1.5).toFixed(2);
      d.collections.push({ id: uid(), farmerId: f.id, date: dStr, shift, milkType: f.milkType, fat, snf, litres, rate, amount: +(litres * rate).toFixed(2) });
    }));
  }
  const qty = 45;
  d.sales.push({ id: uid(), date: today(), customer: 'City Dairy', qty, rate: 55, revenue: qty * 55 });
  d.payments.push({ id: uid(), farmerId: 'f0', date: `${curMo}-05`, amount: 1000, note: 'Cash' });
  d.expenses.push({ id: uid(), date: `${curMo}-03`, category: 'Transport', desc: 'Milk van fuel', amount: 600 },
    { id: uid(), date: `${curMo}-08`, category: 'Electricity', desc: 'Chiller bill', amount: 450 });
  return d;
}
let db = JSON.parse(localStorage.getItem(KEY)) || sampleData();
db.farmers.forEach(f => { if (!f.milkType) f.milkType = 'Cow'; });
const curMonthStr = today().slice(0, 7);
if (!db.collections.some(c => c.date.startsWith(curMonthStr + '-0'))) {
  const fresh = sampleData();
  fresh.collections.forEach(c => {
    if (!db.collections.some(ex => ex.farmerId === c.farmerId && ex.date === c.date && ex.shift === c.shift)) {
      db.collections.push(c);
    }
  });
}
db.collections.forEach(c => {
  if (!c.milkType) {
    const f = db.farmers.find(x => x.id === c.farmerId);
    c.milkType = f ? (f.milkType || 'Cow') : 'Cow';
  }
  if (c.fat == null) c.fat = c.milkType === 'Buffalo' ? 6.5 : 4.0;
  if (c.snf == null) c.snf = c.milkType === 'Buffalo' ? 9.0 : 8.5;
});
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const farmerName = id => (db.farmers.find(f => f.id === id) || { name: '(deleted farmer)' }).name;

// Small message at the bottom-right ("error" turns it red)
function toast(msg, error) {
  const t = $('toast'); t.textContent = msg; t.className = 'show' + (error ? ' error' : '');
  setTimeout(() => t.className = '', 2500);
}
// Turn a list into table rows; shows a friendly message when empty
function rows(list, fn, cols) { return list.length ? list.map(fn).join('') : `<tr><td class="empty" colspan="${cols}">Nothing here yet.</td></tr>`; }
const delBtn = (type, id) => `<button class="link del" data-del="${type}" data-id="${id}">Delete</button>`;
const match = (text, q) => text.toLowerCase().includes(q.trim().toLowerCase());   // used by search boxes
const newestFirst = (a, b) => b.date.localeCompare(a.date);

// Totals for any set of dates. `inRange` is a function that says whether a date counts.
function totals(inRange = () => true) {
  const c = db.collections.filter(x => inRange(x.date)), s = db.sales.filter(x => inRange(x.date)), e = db.expenses.filter(x => inRange(x.date));
  const t = { collected: sum(c, x => x.litres), cost: sum(c, x => x.amount), sold: sum(s, x => x.qty), revenue: sum(s, x => x.revenue), expenses: sum(e, x => x.amount) };
  t.income = t.revenue - t.cost - t.expenses;   // net income
  return t;
}
const stock = () => totals().collected - totals().sold;   // remaining milk

// ---------- 2. NAVIGATION ----------
document.querySelectorAll('nav button').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('nav button, .page').forEach(el => el.classList.remove('active'));
  btn.classList.add('active'); $(btn.dataset.page).classList.add('active');
  render();
});

// One click handler for every Delete / Edit button (event delegation)
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.del) {
    if (!confirm('Delete this record?')) return;
    const type = b.dataset.del, id = b.dataset.id;
    db[type] = db[type].filter(x => x.id !== id);
    syncRecord(type, { id }, true);
    if (type === 'farmers') { // also remove that farmer's collections and payments
      db.collections = db.collections.filter(x => x.farmerId !== id);
      db.payments = db.payments.filter(x => x.farmerId !== id);
    }
    save(); render(); toast('Deleted');
  }
  if (b.dataset.edit) startEditFarmer(b.dataset.edit);
});
$('resetBtn').onclick = () => { if (confirm('Replace all data with sample data?')) { db = sampleData(); save(); render(); toast('Sample data restored'); } };

// ---------- 3a. FARMERS ----------
$('farmerForm').onsubmit = e => {
  e.preventDefault();
  const name = $('fName').value.trim(), phone = $('fPhone').value.trim(), village = $('fVillage').value.trim(),
    milkType = $('fMilkType').value || 'Cow', id = $('fId').value;
  if (!name) return toast('Please enter the farmer name', true);
  if (!/^\d{10}$/.test(phone)) return toast('Phone must be exactly 10 digits', true);
  const rec = id ? Object.assign(db.farmers.find(f => f.id === id), { name, phone, village, milkType })
    : { id: uid(), name, phone, village, milkType };
  if (!id) db.farmers.push(rec);
  syncRecord('farmers', rec);
  toast(id ? 'Farmer updated' : 'Farmer added');
  stopEditFarmer(); save(); render();
};
function startEditFarmer(id) {
  const f = db.farmers.find(x => x.id === id);
  $('fId').value = f.id; $('fName').value = f.name; $('fPhone').value = f.phone; $('fVillage').value = f.village;
  $('fMilkType').value = f.milkType || 'Cow';
  $('fSave').textContent = 'Update farmer'; $('fCancel').hidden = false; $('fName').focus();
}
function stopEditFarmer() { $('farmerForm').reset(); $('fId').value = ''; $('fMilkType').value = 'Cow'; $('fSave').textContent = 'Add farmer'; $('fCancel').hidden = true; }
$('fCancel').onclick = stopEditFarmer;
$('fSearch').oninput = renderFarmers;
function renderFarmers() {
  const q = $('fSearch').value;
  const list = db.farmers.filter(f => match(f.name + f.phone + f.village + (f.milkType || ''), q));
  $('farmerBody').innerHTML = rows(list, f => `<tr><td>${esc(f.name)}</td><td>${esc(f.phone)}</td><td>${esc(f.village)}</td>
    <td><span class="badge ${(f.milkType || 'Cow').toLowerCase()}">${esc(f.milkType || 'Cow')}</span></td>
    <td><button class="link" data-edit="${f.id}">Edit</button> ${delBtn('farmers', f.id)}</td></tr>`, 5);
}

// ---------- 3b. MILK COLLECTION ----------
const calcAmount = () => $('cAmount').value = ($('cLitres').value * $('cRate').value) ? money($('cLitres').value * $('cRate').value) : '';
$('cLitres').oninput = $('cRate').oninput = calcAmount;   // automatic payment calculation

function updateRate() {
  const isBuffalo = $('cMilkType').value === 'Buffalo';
  const baseRate = isBuffalo ? 55 : 40;
  const baseFat = isBuffalo ? 6.5 : 4.0;
  const baseSnf = isBuffalo ? 9.0 : 8.5;
  const fat = +$('cFat').value || baseFat;
  const snf = +$('cSnf').value || baseSnf;
  // Standard dairy rate adjustment based on Fat & SNF variance
  const calcRate = baseRate + (fat - baseFat) * 2.5 + (snf - baseSnf) * 1.5;
  $('cRate').value = Math.max(10, +calcRate.toFixed(2));
  calcAmount();
}

function applyMilkDefaults() {
  const isBuffalo = $('cMilkType').value === 'Buffalo';
  $('cFat').value = isBuffalo ? 6.5 : 4.0;
  $('cSnf').value = isBuffalo ? 9.0 : 8.5;
  updateRate();
}

function syncFarmerDetails() {
  const f = db.farmers.find(x => x.id === $('cFarmer').value);
  if (!f) return;
  if ($('cFarmerSearch') && document.activeElement !== $('cFarmerSearch')) {
    $('cFarmerSearch').value = f.name;
  }
  $('cMilkType').value = f.milkType || 'Cow';
  applyMilkDefaults();
}

$('cMilkType').onchange = applyMilkDefaults;
$('cFat').oninput = $('cSnf').oninput = updateRate;
$('cFarmer').onchange = syncFarmerDetails;

$('cFarmerSearch').oninput = () => {
  const q = $('cFarmerSearch').value.toLowerCase().trim();
  const matchFarmer = db.farmers.find(f =>
    f.name.toLowerCase() === q ||
    f.phone === q ||
    `${f.name} - ${f.phone}`.toLowerCase() === q ||
    `${f.name} (${f.milkType || 'Cow'})`.toLowerCase() === q
  );
  if (matchFarmer) {
    $('cFarmer').value = matchFarmer.id;
    syncFarmerDetails();
  } else {
    filterFarmerDropdown(q);
  }
};

$('collForm').onsubmit = e => {
  e.preventDefault();
  const farmerId = $('cFarmer').value, date = $('cDate').value, shift = $('cShift').value,
    milkType = $('cMilkType').value, fat = +$('cFat').value || 0, snf = +$('cSnf').value || 0,
    litres = +$('cLitres').value, rate = +$('cRate').value;
  if (!farmerId) return toast('Add or select a farmer first', true);
  if (!date) return toast('Choose a date', true);
  if (litres <= 0 || rate <= 0) return toast('Litres and rate must be greater than 0', true);
  if (db.collections.some(c => c.farmerId === farmerId && c.date === date && c.shift === shift))
    return toast('This farmer already has a ' + shift + ' entry for that date', true);
  const cRec = { id: uid(), farmerId, date, shift, milkType, fat, snf, litres, rate, amount: litres * rate };
  db.collections.push(cRec);
  syncRecord('collections', cRec);
  save(); $('cLitres').value = ''; calcAmount(); render(); toast('Collection saved');
};
$('cSearch').oninput = renderCollections;
function renderCollections() {
  const q = $('cSearch').value;
  const list = db.collections.filter(c => match(farmerName(c.farmerId) + c.date + c.shift + (c.milkType || '') + (c.fat || '') + (c.snf || ''), q)).sort(newestFirst);
  $('collBody').innerHTML = rows(list, c => `<tr>
    <td>${c.date}</td>
    <td>${esc(farmerName(c.farmerId))}</td>
    <td><span class="badge ${(c.milkType || 'Cow').toLowerCase()}">${esc(c.milkType || 'Cow')}</span></td>
    <td>${c.shift}</td>
    <td>${c.fat != null ? (+c.fat).toFixed(1) : '-'}</td>
    <td>${c.snf != null ? (+c.snf).toFixed(1) : '-'}</td>
    <td>${c.litres}</td>
    <td>${money(c.rate)}</td>
    <td>${money(c.amount)}</td>
    <td>${delBtn('collections', c.id)}</td>
  </tr>`, 10);
}

// ---------- 3c. MILK SALES ----------
const calcRevenue = () => $('sRevenue').value = ($('sQty').value * $('sRate').value) ? money($('sQty').value * $('sRate').value) : '';
$('sQty').oninput = $('sRate').oninput = calcRevenue;
$('saleForm').onsubmit = e => {
  e.preventDefault();
  const date = $('sDate').value, customer = $('sCustomer').value.trim(), qty = +$('sQty').value, rate = +$('sRate').value;
  if (!date || !customer) return toast('Enter date and customer', true);
  if (qty <= 0 || rate <= 0) return toast('Quantity and rate must be greater than 0', true);
  if (qty > stock()) return toast('Only ' + stock().toFixed(1) + ' L available in stock', true);   // can't sell more than we have
  const sRec = { id: uid(), date, customer, qty, rate, revenue: qty * rate };
  db.sales.push(sRec);
  syncRecord('sales', sRec);
  save(); $('sQty').value = ''; $('sCustomer').value = ''; calcRevenue(); render(); toast('Sale saved');
};
$('sSearch').oninput = renderSales;
function renderSales() {
  $('stockHint').textContent = stock().toFixed(1);
  const list = db.sales.filter(s => match(s.customer + s.date, $('sSearch').value)).sort(newestFirst);
  $('saleBody').innerHTML = rows(list, s => `<tr><td>${s.date}</td><td>${esc(s.customer)}</td><td>${s.qty}</td><td>${money(s.rate)}</td><td>${money(s.revenue)}</td><td>${delBtn('sales', s.id)}</td></tr>`, 6);
}

// ---------- 3d. FARMER PAYMENTS ----------
// Balance due = total milk amount earned − total payments made
const balance = id => sum(db.collections.filter(c => c.farmerId === id), c => c.amount) - sum(db.payments.filter(p => p.farmerId === id), p => p.amount);
const showDue = () => $('dueHint').textContent = $('pFarmer').value ? 'Balance due for this farmer: ' + money(balance($('pFarmer').value)) : '';
$('pFarmer').onchange = showDue;
$('payForm').onsubmit = e => {
  e.preventDefault();
  const farmerId = $('pFarmer').value, date = $('pDate').value, amount = +$('pAmount').value, note = $('pNote').value.trim();
  if (!farmerId || !date) return toast('Choose a farmer and date', true);
  if (amount <= 0) return toast('Amount must be greater than 0', true);
  if (amount > balance(farmerId) + 0.001) return toast('Amount is more than the balance due (' + money(balance(farmerId)) + ')', true);
  const pRec = { id: uid(), farmerId, date, amount, note };
  db.payments.push(pRec);
  syncRecord('payments', pRec);
  save(); $('pAmount').value = ''; $('pNote').value = ''; render(); toast('Payment saved');
};
function renderPayments() {
  $('balBody').innerHTML = rows(db.farmers, f => {
    const earned = sum(db.collections.filter(c => c.farmerId === f.id), c => c.amount), due = balance(f.id);
    return `<tr><td>${esc(f.name)}</td><td>${money(earned)}</td><td>${money(earned - due)}</td><td class="${due > 0 ? 'due' : ''}">${money(due)}</td></tr>`;
  }, 4);
  $('payBody').innerHTML = rows([...db.payments].sort(newestFirst), p => `<tr><td>${p.date}</td><td>${esc(farmerName(p.farmerId))}</td><td>${money(p.amount)}</td><td>${esc(p.note)}</td><td>${delBtn('payments', p.id)}</td></tr>`, 5);
  showDue();
}

// ---------- 3e. EXPENSES ----------
$('expForm').onsubmit = e => {
  e.preventDefault();
  const date = $('eDate').value, category = $('eCat').value, desc = $('eDesc').value.trim(), amount = +$('eAmount').value;
  if (!date || !desc) return toast('Enter date and description', true);
  if (amount <= 0) return toast('Amount must be greater than 0', true);
  const eRec = { id: uid(), date, category, desc, amount };
  db.expenses.push(eRec);
  syncRecord('expenses', eRec);
  save(); $('eDesc').value = ''; $('eAmount').value = ''; render(); toast('Expense saved');
};
$('eSearch').oninput = renderExpenses;
function renderExpenses() {
  const list = db.expenses.filter(x => match(x.category + x.desc + x.date, $('eSearch').value)).sort(newestFirst);
  $('expBody').innerHTML = rows(list, x => `<tr><td>${x.date}</td><td>${x.category}</td><td>${esc(x.desc)}</td><td>${money(x.amount)}</td><td>${delBtn('expenses', x.id)}</td></tr>`, 5);
}

// ---------- 4. DASHBOARD & REPORTS ----------
function renderDashboard() {
  const t = totals();
  $('dFarmers').textContent = db.farmers.length;
  $('dCollected').textContent = t.collected.toFixed(1) + ' L';
  $('dSold').textContent = t.sold.toFixed(1) + ' L';
  $('dRemaining').textContent = (t.collected - t.sold).toFixed(1) + ' L';
  $('dIncome').textContent = money(t.income);
  const recent = [...db.collections].sort(newestFirst).slice(0, 5);
  $('recentBody').innerHTML = rows(recent, c => `<tr><td>${c.date}</td><td>${esc(farmerName(c.farmerId))} <span class="badge ${(c.milkType || 'Cow').toLowerCase()}">${esc(c.milkType || 'Cow')}</span></td><td>${c.shift}</td><td>${c.litres}</td><td>${money(c.amount)}</td></tr>`, 5);
}
// Summary cards used by both the daily and monthly reports
const reportCards = t => [['Collected', t.collected.toFixed(1) + ' L'], ['Sold', t.sold.toFixed(1) + ' L'], ['Revenue', money(t.revenue)],
['Milk cost', money(t.cost)], ['Expenses', money(t.expenses)], ['Net income', money(t.income)]]
  .map(([k, v]) => `<div class="card"><span>${k}</span><b>${v}</b></div>`).join('');
function renderReports() {
  const day = $('rDay').value, month = $('rMonth').value;
  $('dayCards').innerHTML = reportCards(totals(d => d === day));
  const inMonth = d => d.startsWith(month);
  $('monthCards').innerHTML = reportCards(totals(inMonth));
  // one table row per date that has any activity in the month
  const dates = [...new Set([...db.collections, ...db.sales, ...db.expenses].map(x => x.date).filter(inMonth))].sort();
  $('monthBody').innerHTML = rows(dates, d => {
    const t = totals(x => x === d);
    return `<tr><td>${d}</td><td>${t.collected.toFixed(1)}</td><td>${t.sold.toFixed(1)}</td><td>${money(t.revenue)}</td><td>${money(t.cost)}</td><td>${money(t.expenses)}</td></tr>`;
  }, 6);
}
$('rDay').onchange = $('rMonth').onchange = renderReports;

// ---------- RENDER EVERYTHING ----------
function filterFarmerDropdown(filterText = '') {
  const cSel = $('cFarmer'), old = cSel.value;
  const q = filterText.toLowerCase().trim();
  const filtered = db.farmers.filter(f => match(f.name + f.phone + f.village + (f.milkType || ''), q));
  cSel.innerHTML = (filtered.length ? filtered : db.farmers).map(f => `<option value="${f.id}">${esc(f.name)} (${esc(f.milkType || 'Cow')})</option>`).join('');
  if (db.farmers.some(f => f.id === old)) cSel.value = old;
  else if (cSel.options.length) cSel.selectedIndex = 0;
}

// Keep each dropdown's chosen value when the farmer list is rebuilt
function fillFarmerSelects() {
  if ($('cFarmerList')) {
    $('cFarmerList').innerHTML = db.farmers.map(f => `<option value="${esc(f.name)}">${esc(f.village)} • ${f.phone} • ${f.milkType || 'Cow'}</option>`).join('');
  }
  filterFarmerDropdown($('cFarmerSearch') ? $('cFarmerSearch').value : '');
  const pSel = $('pFarmer'), pOld = pSel.value;
  pSel.innerHTML = db.farmers.map(f => `<option value="${f.id}">${esc(f.name)} (${esc(f.milkType || 'Cow')})</option>`).join('');
  if (db.farmers.some(f => f.id === pOld)) pSel.value = pOld;

  const bSel = $('billFarmer');
  if (bSel) {
    const bOld = bSel.value;
    bSel.innerHTML = db.farmers.map(f => `<option value="${f.id}">${esc(f.name)} (${esc(f.milkType || 'Cow')})</option>`).join('');
    if (db.farmers.some(f => f.id === bOld)) bSel.value = bOld;
  }
}

// Convert numbers to Indian Rupees in words
function numberToWords(n) {
  const num = Math.round(Math.abs(n));
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function convert(val) {
    if (val < 20) return ones[val];
    if (val < 100) return tens[Math.floor(val / 10)] + (val % 10 ? ' ' + ones[val % 10] : '');
    if (val < 1000) return ones[Math.floor(val / 100)] + ' Hundred' + (val % 100 ? ' And ' + convert(val % 100) : '');
    if (val < 100000) return convert(Math.floor(val / 1000)) + ' Thousand' + (val % 1000 ? ' ' + convert(val % 1000) : '');
    if (val < 10000000) return convert(Math.floor(val / 100000)) + ' Lakh' + (val % 100000 ? ' ' + convert(val % 100000) : '');
    return convert(Math.floor(val / 10000000)) + ' Crore' + (val % 10000000 ? ' ' + convert(val % 10000000) : '');
  }
  return convert(num) + ' Rupees Only';
}

// ---------- 10-DAY MILK BILL GENERATION ----------
function generateBill() {
  const paper = $('billPaper');
  if (!paper) return;
  const farmerId = $('billFarmer') ? $('billFarmer').value : (db.farmers[0] || {}).id;
  const farmer = db.farmers.find(f => f.id === farmerId);
  if (!farmer) {
    paper.innerHTML = '<div style="text-align:center; padding:30px; color:#777;">Please add a farmer to generate bill.</div>';
    return;
  }
  const month = ($('billMonth') && $('billMonth').value) ? $('billMonth').value : today().slice(0, 7);
  const cycle = $('billCycle') ? $('billCycle').value : '1';
  const [yr, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();

  let startDay = 1, endDay = 10;
  if (cycle === '2') { startDay = 11; endDay = 20; }
  else if (cycle === '3') { startDay = 21; endDay = daysInMonth; }

  const startDate = `${month}-${String(startDay).padStart(2, '0')}`;
  const endDate = `${month}-${String(endDay).padStart(2, '0')}`;
  const fmtD = dStr => {
    const p = dStr.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
  };

  let mTotLitres = 0, mTotAmount = 0;
  let eTotLitres = 0, eTotAmount = 0;

  let tableRowsHtml = '';
  for (let d = startDay; d <= endDay; d++) {
    const dStr = `${month}-${String(d).padStart(2, '0')}`;
    const dayLabel = `${String(d).padStart(2, '0')}-${String(mo).padStart(2, '0')}`;

    const m = db.collections.find(c => c.farmerId === farmerId && c.date === dStr && c.shift === 'Morning');
    const e = db.collections.find(c => c.farmerId === farmerId && c.date === dStr && c.shift === 'Evening');

    if (m) { mTotLitres += m.litres; mTotAmount += m.amount; }
    if (e) { eTotLitres += e.litres; eTotAmount += e.amount; }

    tableRowsHtml += `<tr>
      <td class="center" style="font-weight:700;">${dayLabel}</td>
      <td>${m ? m.litres.toFixed(1) : '-'}</td>
      <td>${m && m.fat != null ? (+m.fat).toFixed(1) : '-'}</td>
      <td>${m && m.snf != null ? (+m.snf).toFixed(1) : '-'}</td>
      <td>${m ? (+m.rate).toFixed(2) : '-'}</td>
      <td style="font-weight:700;">${m ? (+m.amount).toFixed(2) : '-'}</td>
      <td>${e ? e.litres.toFixed(1) : '-'}</td>
      <td>${e && e.fat != null ? (+e.fat).toFixed(1) : '-'}</td>
      <td>${e && e.snf != null ? (+e.snf).toFixed(1) : '-'}</td>
      <td>${e ? (+e.rate).toFixed(2) : '-'}</td>
      <td style="font-weight:700;">${e ? (+e.amount).toFixed(2) : '-'}</td>
    </tr>`;
  }

  const totLitres = +(mTotLitres + eTotLitres).toFixed(1);
  const totMilkValue = +(mTotAmount + eTotAmount).toFixed(2);

  const incentiveRate = $('billIncentiveRate') ? (+$('billIncentiveRate').value || 0.70) : 0.70;
  const incentiveAmount = +(totLitres * incentiveRate).toFixed(2);
  const freightRate = 0.15;
  const freightAmount = +(totLitres * freightRate).toFixed(2);
  const advanceDeduction = $('billDeduction') ? (+$('billDeduction').value || 0) : 0;

  const totalEarnings = incentiveAmount;
  const grossAmount = +(totMilkValue + totalEarnings).toFixed(2);
  const totalDeductions = +(freightAmount + advanceDeduction).toFixed(2);
  const netTotal = +(grossAmount - totalDeductions).toFixed(2);
  const netPayable = Math.round(netTotal);
  const roundDiff = +(netPayable - netTotal).toFixed(2);

  const isCow = (farmer.milkType || 'Cow') === 'Cow';

  paper.innerHTML = `
    <div class="dairy-header">
      <div class="dairy-title">GOKUL DUDH SAHKARI, ASHTA</div>
      <div class="dairy-subtitle">
        <span>Milk Bill</span>
        <span>Page: 1</span>
      </div>
    </div>

    <table class="bill-meta-table">
      <tr>
        <td><b>Bill From:</b> ${fmtD(startDate)}</td>
        <td><b>To:</b> ${fmtD(endDate)}</td>
        <td><b>Bank Name:</b> Online Payment Bank List</td>
        <td><b>Route:</b> 19</td>
      </tr>
      <tr>
        <td colspan="2"><b>Centre Code & Name:</b> 1003 &nbsp; Gokul Dudh Sahkari, Ashta</td>
        <td colspan="2"><b>Bank A/c No:</b> 8040010030014701</td>
      </tr>
      <tr>
        <td colspan="2"><b>Farmer Name:</b> <span style="font-size:1.02rem; font-weight:800; text-transform:uppercase;">${esc(farmer.name)}</span></td>
        <td><b>Member No:</b> ${esc(farmer.id.toUpperCase())}</td>
        <td><b>Mobile No.:</b> ${esc(farmer.phone)}</td>
      </tr>
    </table>

    <div class="bill-milk-banner">${esc(farmer.milkType || 'Cow')} Milk</div>
    <table class="bill-shift-table">
      <thead>
        <tr>
          <th colspan="6" class="shift-hdr">MORNING</th>
          <th colspan="5" class="shift-hdr">EVENING</th>
        </tr>
        <tr>
          <th>Date</th>
          <th>Ltr.</th>
          <th>Fat</th>
          <th>SNF</th>
          <th>Rate</th>
          <th>Value Rs.</th>
          <th>Ltr.</th>
          <th>Fat</th>
          <th>SNF</th>
          <th>Rate</th>
          <th>Value Rs.</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td class="center" style="font-weight:700;">TOTAL</td>
          <td style="font-weight:700;">${mTotLitres.toFixed(1)}</td>
          <td colspan="3">-</td>
          <td style="font-weight:700;">${mTotAmount.toFixed(2)}</td>
          <td style="font-weight:700;">${eTotLitres.toFixed(1)}</td>
          <td colspan="3">-</td>
          <td style="font-weight:700;">${eTotAmount.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="bill-summary-row">
      <!-- Left side: Quantity & Deductions Breakdown -->
      <div>
        <table class="bill-sub-table">
          <thead>
            <tr><th>Type</th><th>Total Qty</th><th>Milk Value (₹)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:left;">${isCow ? 'Cow' : 'Buffalo'}</td>
              <td>${totLitres.toFixed(1)}</td>
              <td>${totMilkValue.toFixed(2)}</td>
            </tr>
            <tr style="font-weight:700; background:#f9f9f9;">
              <td style="text-align:left;">ALL TOTAL</td>
              <td>${totLitres.toFixed(1)}</td>
              <td>${totMilkValue.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <table class="bill-sub-table">
          <thead>
            <tr>
              <th style="text-align:left;">Description</th>
              <th>Ltr.</th>
              <th>Rate</th>
              <th>Cr. (₹)</th>
              <th>Dr. (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:left;">Milk Freight</td>
              <td>${totLitres.toFixed(1)}</td>
              <td>${freightRate.toFixed(2)}</td>
              <td>-</td>
              <td>${freightAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="text-align:left;">${isCow ? 'Cow' : 'Buff.'} Incentive</td>
              <td>${totLitres.toFixed(1)}</td>
              <td>${incentiveRate.toFixed(2)}</td>
              <td>${incentiveAmount.toFixed(2)}</td>
              <td>-</td>
            </tr>
            ${advanceDeduction > 0 ? `<tr>
              <td style="text-align:left;">Feed / Advance</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>${advanceDeduction.toFixed(2)}</td>
            </tr>` : ''}
            <tr style="font-weight:700; background:#f9f9f9;">
              <td style="text-align:left;">TOTAL</td>
              <td colspan="2"></td>
              <td>${incentiveAmount.toFixed(2)}</td>
              <td>${totalDeductions.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Right side: Calculation Statement -->
      <div>
        <table class="bill-calc-table">
          <tr>
            <td>Total Milk Value Rs.:</td>
            <td><b>${totMilkValue.toFixed(2)}</b></td>
          </tr>
          <tr>
            <td>Total Earning Amount Rs.:</td>
            <td>${totalEarnings.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Gross Total Amount Rs.:</td>
            <td><b>${grossAmount.toFixed(2)}</b></td>
          </tr>
          <tr>
            <td>Total Deduction Amount Rs.:</td>
            <td>- ${totalDeductions.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Net Total Amount Rs.:</td>
            <td>${netTotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Rounded Amount:</td>
            <td>${roundDiff >= 0 ? '+' : ''}${roundDiff.toFixed(2)}</td>
          </tr>
          <tr class="total-row">
            <td>Net Payable Amount Rs.:</td>
            <td>₹ ${netPayable.toFixed(2)}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="bill-words-box">
      <b>Rupees in Words:</b> ${numberToWords(netPayable)}
    </div>

    <div class="bill-signatures">
      <div>Prepared By</div>
      <div>Soc. Secretary (Gokul)</div>
      <div>Farmer Signature</div>
    </div>
  `;
}

function render() {
  fillFarmerSelects(); renderDashboard(); renderFarmers(); renderCollections();
  renderSales(); renderPayments(); renderExpenses(); renderReports(); generateBill();
}

// Start-up: default every date field to today, then draw the screen
['cDate', 'sDate', 'pDate', 'eDate', 'rDay'].forEach(id => $(id).value = today());
$('rMonth').value = today().slice(0, 7);
if ($('billMonth')) $('billMonth').value = today().slice(0, 7);
if ($('billCycle')) $('billCycle').value = '1';

$('genBillBtn').onclick = generateBill;
$('printBillBtn').onclick = () => window.print();
if ($('billFarmer')) $('billFarmer').onchange = generateBill;
if ($('billMonth')) $('billMonth').onchange = generateBill;
if ($('billCycle')) $('billCycle').onchange = generateBill;
if ($('billDeduction')) $('billDeduction').oninput = generateBill;
if ($('billIncentiveRate')) $('billIncentiveRate').oninput = generateBill;

syncFarmerDetails();
calcAmount(); calcRevenue(); render();
generateBill();
loadFromSupabase();
