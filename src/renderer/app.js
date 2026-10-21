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
let showTags = false;

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

// Short label for an account, e.g. "the-annapolis" or "gmail".
function accountTag(email) {
  const domain = (email || '').split('@')[1] || '';
  return domain.split('.')[0];
}

async function signIn(hint, button) {
  if (button) button.disabled = true;
  try {
    await window.todo.signIn(hint);
  } catch (err) {
    $('status').textContent = `เข้าสู่ระบบไม่สำเร็จ: ${err.message}`;
  } finally {
    if (button) button.disabled = false;
  }
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
        metaBits || SOURCE_LABEL[t.source],
        showTags && t.account ? el('span', { class: 'tag', title: t.account }, accountTag(t.account)) : null)),
    side);
}

function render(s) {
  current = s;
  showTags = s.accounts.length > 1;
  // Offer a sign-in button for each wanted account that isn't connected yet.
  const pending = s.demo ? [] : s.pending;
  $('signin').classList.toggle('hidden', s.signedIn && !pending.length);
  $('no-creds').classList.toggle('hidden', s.hasCredentials);
  $('btn-pick-creds').classList.toggle('hidden', s.hasCredentials);
  const buttons = pending.length ? pending : [''];
  $('signin-buttons').replaceChildren(...buttons.map((email) => {
    const b = el('button', { class: 'primary' }, email ? `เข้าสู่ระบบ ${email}` : 'เข้าสู่ระบบด้วย Google');
    b.disabled = !s.hasCredentials;
    b.onclick = () => signIn(email, b);
    return b;
  }));

  const parts = [];
  if (s.demo) parts.push('โหมดตัวอย่าง');
  if (s.accounts.length) parts.push(`${s.accounts.length} บัญชี`);
  if (s.syncedAt) parts.push(`ซิงก์ ${new Date(s.syncedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);
  const failed = s.accounts.filter((a) => a.error);
  if (failed.length) parts.push(`⚠ ซิงก์ไม่สำเร็จ: ${failed.map((a) => a.email).join(', ')}`);
  $('status').textContent = parts.join(' · ');
  if (!$('settings').classList.contains('hidden')) renderAccounts();

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

function renderAccounts() {
  $('account-list').replaceChildren(...current.accounts.map((a) => el('div', { class: 'account' },
    el('div', {},
      el('div', { class: 'email' }, a.email),
      a.error ? el('div', { class: 'err' }, a.error.slice(0, 120)) : null),
    current.demo ? null : el('button', { onclick: () => window.todo.signOut(a.email) }, 'ออก'))));
  $('btn-add-account').classList.toggle('hidden', current.demo);
}

function fillSettings() {
  const st = current.settings;
  renderAccounts();
  $('set-query').value = st.gmailQuery;
  $('set-calendars').value = st.calendarIds.join(', ');
  $('set-days').value = st.days;
  $('set-ontop').checked = st.alwaysOnTop;
  $('set-login').checked = st.openAtLogin;
}

$('btn-settings').onclick = () => {
  const panel = $('settings');
  if (panel.classList.contains('hidden')) fillSettings();
  panel.classList.toggle('hidden');
};
$('btn-save').onclick = async () => {
  await window.todo.saveSettings({
    gmailQuery: $('set-query').value.trim(),
    calendarIds: $('set-calendars').value.split(',').map((x) => x.trim()).filter(Boolean),
    days: Number($('set-days').value) || 7,
    alwaysOnTop: $('set-ontop').checked,
    openAtLogin: $('set-login').checked,
  });
  $('settings').classList.add('hidden');
};
$('btn-pick-creds').onclick = async () => {
  try {
    await window.todo.pickCredentials();
  } catch (err) {
    $('status').textContent = err.message;
  }
};
$('btn-add-account').onclick = () => signIn('', $('btn-add-account'));
$('btn-sync').onclick = () => window.todo.sync();
$('btn-quit').onclick = () => window.todo.quit();
$('btn-clear').onclick = () => window.todo.clearDone();
function openNewTask() {
  $('add-title').value = '';
  $('add-due').value = '';
  $('new-task').classList.remove('hidden');
  $('add-title').focus();
}

function closeNewTask() {
  $('new-task').classList.add('hidden');
}

$('btn-new').onclick = openNewTask;
$('btn-cancel-new').onclick = closeNewTask;
// Clicking the dimmed area outside the box closes it.
$('new-task').onclick = (e) => { if (e.target === $('new-task')) closeNewTask(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeNewTask();
});
$('add').onsubmit = async (e) => {
  e.preventDefault();
  const title = $('add-title').value.trim();
  if (!title) return;
  await window.todo.addTask({ title, due: $('add-due').value || null });
  closeNewTask();
};

window.todo.onState(render);
window.todo.getState().then(render);
