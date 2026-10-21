// Pure helpers that turn Google data into to-do items and merge them with
// local state. No Electron or network code here so it can be unit tested.

const DAY_MS = 24 * 60 * 60 * 1000;

function eventToTask(event) {
  const start = event.start || {};
  const allDay = Boolean(start.date && !start.dateTime);
  // All-day events come as YYYY-MM-DD; treat them as local midnight.
  const due = start.dateTime || (start.date ? `${start.date}T00:00:00` : null);
  return {
    id: `cal:${event.id}`,
    source: 'calendar',
    title: event.summary || '(ไม่มีชื่อ / No title)',
    due,
    allDay,
    detail: event.location || '',
    link: event.htmlLink || null,
  };
}

function header(message, name) {
  const headers = (message.payload && message.payload.headers) || [];
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function senderName(from) {
  // "Jane Doe <jane@x.com>" -> "Jane Doe"; "jane@x.com" -> "jane@x.com"
  const m = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from);
  return (m && m[1]) || from.trim();
}

function messageToTask(message) {
  const from = header(message, 'From');
  const received = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null;
  return {
    id: `mail:${message.threadId || message.id}`,
    source: 'gmail',
    title: header(message, 'Subject') || '(ไม่มีหัวข้อ / No subject)',
    due: null,
    received,
    allDay: false,
    detail: from ? senderName(from) : '',
    link: `https://mail.google.com/mail/u/0/#all/${message.threadId || message.id}`,
  };
}

// Combine synced items with manual tasks and the user's done/hidden state.
function mergeTasks({ calendar = [], gmail = [], manual = [], done = {}, hidden = {} }) {
  const all = [...calendar, ...gmail, ...manual]
    .filter((t) => !hidden[t.id])
    .map((t) => ({ ...t, done: Boolean(done[t.id]) }));
  return all.sort(compareTasks);
}

function sortKey(t) {
  // Dated items first by date, then undated items by when they arrived.
  if (t.due) return [0, Date.parse(t.due)];
  return [1, -(Date.parse(t.received || t.created || 0) || 0)];
}

function compareTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const ka = sortKey(a);
  const kb = sortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

// Group label for the UI: overdue / today / tomorrow / later / no date.
function bucket(task, now = new Date()) {
  if (!task.due) return 'nodate';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = Date.parse(task.due);
  if (due < startOfToday) return 'overdue';
  if (due < startOfToday + DAY_MS) return 'today';
  if (due < startOfToday + 2 * DAY_MS) return 'tomorrow';
  return 'later';
}

module.exports = { eventToTask, messageToTask, mergeTasks, bucket, senderName };
