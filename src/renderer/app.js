const $ = (id) => document.getElementById(id);

const GROUPS = [
  ['overdue', 'เลยกำหนด'],
  ['today', 'วันนี้'],
  ['tomorrow', 'พรุ่งนี้'],
  ['later', 'ถัดไป'],
  ['nodate', 'จากอีเมลและอื่น ๆ'],
];
const SOURCE_LABEL = { calendar: 'ปฏิทิน', gmail: 'อีเมล', manual: 'เพิ่มเอง' };

let current = null;

function fmtTime(task) {
  if (!task.due) return '';
  const d = new Date(task.due);
  const date = d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  if (task.allDay) return date;
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return task.bucket === 'today' ? time : `${date} ${time}`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function renderTask(t) {
  const box = el('input', { type: 'checkbox', onchange: () => window.todo.toggleDone(t.id) });
  box.checked = t.done;
  const metaBits = [fmtTime(t), t.detail].filter(Boolean).join(' · ');
  const side = el('div', { class: 'side' },
    t.link ? el('a', { href: t.link, target: '_blank', title: 'เปิด' }, '↗') : null,
    el('button', { title: 'ซ่อน / ลบ', onclick: () => window.todo.removeTask(t.id) }, '✕'));
  return el('div', { class: `task${t.done ? ' done' : ''}` },
    box,
    el('div', {},
      el('div', { class: 'title' }, t.title),
      el('div', { class: 'meta' },
        el('span', { class: `dot ${t.source}`, title: SOURCE_LABEL[t.source] }),
        metaBits || SOURCE_LABEL[t.source])),
    side);
}

function render(s) {
  current = s;
  const needsSignIn = !s.signedIn;
  $('signin').classList.toggle('hidden', !needsSignIn);
  $('no-creds').classList.toggle('hidden', s.hasCredentials);
  $('creds-path').textContent = s.credentialsPath;
  $('btn-signin').disabled = !s.hasCredentials;

  const parts = [];
  if (s.demo) parts.push('โหมดตัวอย่าง');
  else if (s.email) parts.push(s.email);
  if (s.syncedAt) parts.push(`ซิงก์ ${new Date(s.syncedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);
  if (s.error) parts.push(`ผิดพลาด: ${s.error.slice(0, 80)}`);
  if (s.settings.account && s.email && s.email.toLowerCase() !== s.settings.account.toLowerCase()) {
    parts.push(`⚠ ไม่ใช่บัญชี ${s.settings.account}`);
  }
  $('status').textContent = parts.join(' · ');

  const list = $('list');
  list.replaceChildren();
  const open = s.tasks.filter((t) => !t.done);
  const done = s.tasks.filter((t) => t.done);
  for (const [key, label] of GROUPS) {
    const items = open.filter((t) => t.bucket === key);
    if (!items.length) continue;
    list.append(el('div', { class: `group ${key}` }, el('h2', {}, `${label} (${items.length})`), ...items.map(renderTask)));
  }
  if (done.length) {
    list.append(el('div', { class: 'group' }, el('h2', {}, `เสร็จแล้ว (${done.length})`), ...done.map(renderTask)));
  }
  if (!s.tasks.length && s.signedIn) list.append(el('div', { class: 'empty' }, 'ไม่มีงานค้าง 🎉'));
  $('btn-clear').classList.toggle('hidden', !done.length);
}

function fillSettings() {
  const st = current.settings;
  $('set-account').value = st.account;
  $('set-query').value = st.gmailQuery;
  $('set-calendars').value = st.calendarIds.join(', ');
  $('set-days').value = st.days;
  $('set-ontop').checked = st.alwaysOnTop;
  $('btn-signout').classList.toggle('hidden', !current.signedIn || current.demo);
}

$('btn-settings').onclick = () => {
  const panel = $('settings');
  if (panel.classList.contains('hidden')) fillSettings();
  panel.classList.toggle('hidden');
};
$('btn-save').onclick = async () => {
  await window.todo.saveSettings({
    account: $('set-account').value.trim(),
    gmailQuery: $('set-query').value.trim(),
    calendarIds: $('set-calendars').value.split(',').map((x) => x.trim()).filter(Boolean),
    days: Number($('set-days').value) || 7,
    alwaysOnTop: $('set-ontop').checked,
  });
  $('settings').classList.add('hidden');
};
$('btn-signout').onclick = () => window.todo.signOut();
$('btn-signin').onclick = async () => {
  $('btn-signin').disabled = true;
  try {
    await window.todo.signIn();
  } catch (err) {
    $('status').textContent = `เข้าสู่ระบบไม่สำเร็จ: ${err.message}`;
  } finally {
    $('btn-signin').disabled = false;
  }
};
$('btn-sync').onclick = () => window.todo.sync();
$('btn-quit').onclick = () => window.todo.quit();
$('btn-clear').onclick = () => window.todo.clearDone();
$('add').onsubmit = async (e) => {
  e.preventDefault();
  const title = $('add-title').value.trim();
  if (!title) return;
  await window.todo.addTask({ title, due: $('add-due').value || null });
  $('add-title').value = '';
  $('add-due').value = '';
};

window.todo.onState(render);
window.todo.getState().then(render);
