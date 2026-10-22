const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const google = require('./google');
const { eventToTask, messageToTask, mergeTasks, bucket } = require('./tasks');
const demo = require('./demo');

const DEMO = process.argv.includes('--demo');
const SYNC_EVERY_MS = 10 * 60 * 1000;

// Mail counts as a task only when it is addressed to or names the user AND is
// about a meeting or appointment. Promotions/social/forums tabs are skipped.
const MEETING_QUERY = [
  'in:inbox newer_than:14d -category:promotions -category:social -category:forums',
  '(to:me OR Nakorn OR นคร)',
  '(ประชุม OR นัด OR นัดหมาย OR meeting OR appointment OR invitation OR invite OR schedule OR call)',
].join(' ');
// Earlier default; installs that never changed it move to MEETING_QUERY.
const OLD_DEFAULT_QUERY = 'in:inbox (is:starred OR (is:unread newer_than:7d))';

const DEFAULT_STATE = {
  settings: {
    // Accounts the user wants in the widget; each gets a sign-in button.
    accounts: ['nakorn@the-annapolis.com', 'joke.nakorn22@gmail.com'],
    gmailQuery: MEETING_QUERY,
    calendarIds: ['primary'],
    days: 7,
    alwaysOnTop: true,
    openAtLogin: true,
  },
  // Signed-in Google accounts: [{ email, tokens, calendar, gmail, error }]
  accounts: [],
  manual: [],
  done: {},
  hidden: {},
  syncedAt: null,
};

let win;
let state;

function statePath() {
  return path.join(app.getPath('userData'), DEMO ? 'demo-state.json' : 'state.json');
}

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    const loaded = { ...DEFAULT_STATE, ...saved, settings: { ...DEFAULT_STATE.settings, ...saved.settings } };
    // Earlier versions stored a single account at the top level.
    if (saved.tokens && saved.email) loaded.accounts = [{ email: saved.email, tokens: saved.tokens }];
    delete loaded.tokens;
    delete loaded.email;
    delete loaded.synced;
    delete loaded.settings.account;
    if (loaded.settings.gmailQuery === OLD_DEFAULT_QUERY) loaded.settings.gmailQuery = MEETING_QUERY;
    return loaded;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

// credentials.json may sit next to the app or in the user data folder.
function credentialsPath() {
  const candidates = [
    path.join(app.getPath('userData'), 'credentials.json'),
    path.join(__dirname, '..', 'credentials.json'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function sameEmail(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

function view() {
  const signedIn = state.accounts.map((a) => a.email);
  // Wanted accounts that are not signed in yet, so the UI can offer them.
  const pending = state.settings.accounts.filter((e) => !signedIn.some((s) => sameEmail(s, e)));
  return {
    demo: DEMO,
    signedIn: state.accounts.length > 0,
    accounts: state.accounts.map((a) => ({ email: a.email, error: a.error || null })),
    pending,
    hasCredentials: DEMO || Boolean(google.loadClient(credentialsPath())),
    credentialsPath: credentialsPath(),
    settings: state.settings,
    syncedAt: state.syncedAt,
    tasks: mergeTasks({
      calendar: state.accounts.flatMap((a) => a.calendar || []),
      gmail: state.accounts.flatMap((a) => a.gmail || []),
      manual: state.manual,
      done: state.done,
      hidden: state.hidden,
    }).map((t) => ({ ...t, bucket: bucket(t) })),
  };
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('state', view());
}

async function syncAccount(client, account) {
  try {
    account.tokens = await google.freshTokens(client, account.tokens);
    const { calendarIds, days, gmailQuery } = state.settings;
    const [events, messages] = await Promise.all([
      google.fetchEvents(account.tokens, { calendarIds, days }),
      google.fetchMessages(account.tokens, { query: gmailQuery }),
    ]);
    account.calendar = events.map((e) => eventToTask(e, account.email));
    account.gmail = messages.map((m) => messageToTask(m, account.email));
    account.error = null;
  } catch (err) {
    // Keep the last good items so one failing account doesn't empty the list.
    account.error = err.message;
  }
}

async function sync() {
  if (DEMO) {
    state.accounts = demo.data();
    state.syncedAt = new Date().toISOString();
    return push();
  }
  const client = google.loadClient(credentialsPath());
  if (!client || !state.accounts.length) return push();
  await Promise.all(state.accounts.map((a) => syncAccount(client, a)));
  state.syncedAt = new Date().toISOString();
  saveState();
  push();
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 340;
  const height = 520;
  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + 16,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: state.settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('get-state', () => view());

// Adds (or re-authorizes) one Google account. `hint` pre-selects it in Google's picker.
ipcMain.handle('sign-in', async (_e, hint) => {
  const client = google.loadClient(credentialsPath());
  if (!client) throw new Error('credentials.json not found');
  const tokens = await google.signIn(client, hint);
  const email = await google.userEmail(tokens);
  const existing = state.accounts.find((a) => sameEmail(a.email, email));
  if (existing) existing.tokens = tokens;
  else state.accounts.push({ email, tokens });
  if (!state.settings.accounts.some((e) => sameEmail(e, email))) state.settings.accounts.push(email);
  saveState();
  await sync();
});

ipcMain.handle('sign-out', (_e, email) => {
  state.accounts = state.accounts.filter((a) => !sameEmail(a.email, email));
  state.settings.accounts = state.settings.accounts.filter((e) => !sameEmail(e, email));
  saveState();
  push();
});

ipcMain.handle('sync', () => sync());

ipcMain.handle('toggle-done', (_e, id) => {
  if (state.done[id]) delete state.done[id];
  else state.done[id] = new Date().toISOString();
  saveState();
  push();
});

ipcMain.handle('add-task', (_e, { title, due }) => {
  state.manual.push({
    id: `manual:${Date.now()}`,
    source: 'manual',
    title,
    // Date-only input is local midnight, matching how all-day events are stored.
    due: due ? (due.length === 10 ? `${due}T00:00:00` : due) : null,
    allDay: Boolean(due && due.length === 10),
    created: new Date().toISOString(),
    detail: '',
    link: null,
  });
  saveState();
  push();
});

ipcMain.handle('remove-task', (_e, id) => {
  if (id.startsWith('manual:')) state.manual = state.manual.filter((t) => t.id !== id);
  else state.hidden[id] = true;
  delete state.done[id];
  saveState();
  push();
});

ipcMain.handle('clear-done', () => {
  for (const id of Object.keys(state.done)) {
    if (id.startsWith('manual:')) state.manual = state.manual.filter((t) => t.id !== id);
    else state.hidden[id] = true;
  }
  state.done = {};
  saveState();
  push();
});

ipcMain.handle('save-settings', async (_e, settings) => {
  state.settings = { ...state.settings, ...settings };
  win.setAlwaysOnTop(state.settings.alwaysOnTop);
  applyLoginItem();
  saveState();
  await sync();
});

// Copies the user's chosen OAuth client file into the user-data folder,
// so the installed app finds it without the user locating that folder.
ipcMain.handle('pick-credentials', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'เลือกไฟล์ credentials.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return;
  const target = path.join(app.getPath('userData'), 'credentials.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePaths[0], target);
  if (!google.loadClient(target)?.clientId) {
    fs.rmSync(target);
    throw new Error('ไฟล์นี้ไม่ใช่ OAuth client ของ Google');
  }
  push();
});

ipcMain.handle('quit', () => app.quit());

// Start with Windows/macOS login; only for the installed app, not `npm start`.
function applyLoginItem() {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: state.settings.openAtLogin });
}

app.whenReady().then(() => {
  state = loadState();
  applyLoginItem();
  createWindow();
  sync();
  setInterval(sync, SYNC_EVERY_MS);
});

app.on('window-all-closed', () => app.quit());
