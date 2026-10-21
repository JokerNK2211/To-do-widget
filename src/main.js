const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const google = require('./google');
const { eventToTask, messageToTask, mergeTasks, bucket } = require('./tasks');
const demo = require('./demo');

const DEMO = process.argv.includes('--demo');
const SYNC_EVERY_MS = 10 * 60 * 1000;

const DEFAULT_STATE = {
  settings: {
    account: '',
    gmailQuery: 'in:inbox (is:starred OR (is:unread newer_than:7d))',
    calendarIds: ['primary'],
    days: 7,
    alwaysOnTop: true,
  },
  tokens: null,
  email: null,
  manual: [],
  done: {},
  hidden: {},
  synced: { calendar: [], gmail: [], at: null, error: null },
};

let win;
let state;

function statePath() {
  return path.join(app.getPath('userData'), DEMO ? 'demo-state.json' : 'state.json');
}

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return { ...DEFAULT_STATE, ...saved, settings: { ...DEFAULT_STATE.settings, ...saved.settings } };
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

function view() {
  return {
    demo: DEMO,
    signedIn: DEMO || Boolean(state.tokens),
    email: DEMO ? 'demo@example.com' : state.email,
    hasCredentials: DEMO || Boolean(google.loadClient(credentialsPath())),
    credentialsPath: credentialsPath(),
    settings: state.settings,
    syncedAt: state.synced.at,
    error: state.synced.error,
    tasks: mergeTasks({ ...state.synced, manual: state.manual, done: state.done, hidden: state.hidden })
      .map((t) => ({ ...t, bucket: bucket(t) })),
  };
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('state', view());
}

async function sync() {
  if (DEMO) {
    state.synced = { ...demo.data(), at: new Date().toISOString(), error: null };
    return push();
  }
  const client = google.loadClient(credentialsPath());
  if (!client || !state.tokens) return push();
  try {
    state.tokens = await google.freshTokens(client, state.tokens);
    const { calendarIds, days, gmailQuery } = state.settings;
    const [events, messages] = await Promise.all([
      google.fetchEvents(state.tokens, { calendarIds, days }),
      google.fetchMessages(state.tokens, { query: gmailQuery }),
    ]);
    state.synced = {
      calendar: events.map(eventToTask),
      gmail: messages.map(messageToTask),
      at: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    state.synced.error = err.message;
  }
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

ipcMain.handle('sign-in', async () => {
  const client = google.loadClient(credentialsPath());
  if (!client) throw new Error('credentials.json not found');
  state.tokens = await google.signIn(client, state.settings.account);
  state.email = await google.userEmail(state.tokens);
  saveState();
  await sync();
});

ipcMain.handle('sign-out', () => {
  state.tokens = null;
  state.email = null;
  state.synced = structuredClone(DEFAULT_STATE.synced);
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
  saveState();
  await sync();
});

ipcMain.handle('quit', () => app.quit());

app.whenReady().then(() => {
  state = loadState();
  createWindow();
  sync();
  setInterval(sync, SYNC_EVERY_MS);
});

app.on('window-all-closed', () => app.quit());
