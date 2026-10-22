const test = require('node:test');
const assert = require('node:assert');
const { eventToTask, messageToTask, mergeTasks, bucket, senderName } = require('../src/tasks');

test('timed calendar event becomes a dated task', () => {
  const t = eventToTask(
    { id: 'a', summary: 'Standup', start: { dateTime: '2026-10-21T10:00:00+07:00' }, location: 'Meet', htmlLink: 'https://x/event?eid=1' },
    'me@work.com',
  );
  assert.deepStrictEqual(t, {
    id: 'cal:me@work.com:a', source: 'calendar', account: 'me@work.com', title: 'Standup',
    due: '2026-10-21T10:00:00+07:00', allDay: false, detail: 'Meet',
    link: 'https://x/event?eid=1&authuser=me%40work.com',
  });
});

test('all-day event is due at local midnight', () => {
  const t = eventToTask({ id: 'b', summary: 'Holiday', start: { date: '2026-10-23' } });
  assert.strictEqual(t.allDay, true);
  assert.strictEqual(t.due, '2026-10-23T00:00:00');
  const d = new Date(t.due);
  assert.strictEqual(d.getHours(), 0);
  assert.strictEqual(d.getDate(), 23);
});

test('gmail message becomes an undated task keyed by thread', () => {
  const t = messageToTask({
    id: 'm1', threadId: 't9', internalDate: '1761000000000',
    payload: { headers: [{ name: 'Subject', value: 'Please review' }, { name: 'From', value: '"Jane Doe" <jane@x.com>' }] },
  }, 'me@gmail.com');
  assert.strictEqual(t.id, 'mail:me@gmail.com:t9');
  assert.strictEqual(t.account, 'me@gmail.com');
  assert.match(t.link, /authuser=me%40gmail\.com/);
  assert.strictEqual(t.title, 'Please review');
  assert.strictEqual(t.detail, 'Jane Doe');
  assert.strictEqual(t.due, null);
  assert.match(t.link, /#all\/t9$/);
});

test('the same event in two accounts stays two separate items', () => {
  const event = { id: 'shared', summary: 'Meeting', start: { dateTime: '2026-10-21T10:00:00Z' } };
  const out = mergeTasks({ calendar: [eventToTask(event, 'a@x.com'), eventToTask(event, 'b@y.com')], done: { 'cal:a@x.com:shared': 'x' } });
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out.map((t) => [t.account, t.done]), [['b@y.com', false], ['a@x.com', true]]);
});

test('senderName handles bare addresses', () => {
  assert.strictEqual(senderName('jane@x.com'), 'jane@x.com');
  assert.strictEqual(senderName('Jane <jane@x.com>'), 'Jane');
});

test('merge hides hidden items, marks done, and sorts done last', () => {
  const calendar = [
    { id: 'cal:2', due: '2026-10-22T09:00:00' },
    { id: 'cal:1', due: '2026-10-21T09:00:00' },
  ];
  const gmail = [{ id: 'mail:1', due: null, received: '2026-10-20T00:00:00Z' }];
  const manual = [{ id: 'manual:1', due: null, created: '2026-10-21T00:00:00Z' }];
  const out = mergeTasks({ calendar, gmail, manual, done: { 'cal:1': 'x' }, hidden: { 'mail:x': true } });
  assert.deepStrictEqual(out.map((t) => t.id), ['cal:2', 'manual:1', 'mail:1', 'cal:1']);
  assert.strictEqual(out.at(-1).done, true);

  const hidden = mergeTasks({ calendar, hidden: { 'cal:2': true } });
  assert.deepStrictEqual(hidden.map((t) => t.id), ['cal:1']);
});

test('bucket groups by day relative to now', () => {
  const now = new Date(2026, 9, 21, 12, 0);
  const at = (d, h) => new Date(2026, 9, d, h).toISOString();
  assert.strictEqual(bucket({ due: at(20, 23) }, now), 'overdue');
  assert.strictEqual(bucket({ due: at(21, 8) }, now), 'today');
  assert.strictEqual(bucket({ due: at(22, 8) }, now), 'tomorrow');
  assert.strictEqual(bucket({ due: at(25, 8) }, now), 'later');
  assert.strictEqual(bucket({ due: null }, now), 'nodate');
});
