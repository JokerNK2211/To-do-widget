// Sample data for `npm run demo`, shaped like real Calendar/Gmail API responses
// so it goes through the same conversion code.

const { eventToTask, messageToTask } = require('./tasks');

function at(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateOnly(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function data() {
  const events = [
    { id: 'e1', summary: 'ประชุมทีมประจำสัปดาห์', start: { dateTime: at(0, 10) }, location: 'Google Meet' },
    { id: 'e2', summary: 'ส่งใบเสนอราคาลูกค้า', start: { dateTime: at(0, 16, 30) } },
    { id: 'e3', summary: 'Dentist appointment', start: { dateTime: at(1, 9) }, location: 'Bangkok Dental' },
    { id: 'e4', summary: 'วันเกิดคุณแม่', start: { date: dateOnly(3) } },
  ];
  const messages = [
    {
      id: 'm1', threadId: 't1', internalDate: String(Date.now() - 3600000),
      payload: { headers: [{ name: 'Subject', value: 'กรุณาตรวจสอบสัญญาภายในวันศุกร์' }, { name: 'From', value: 'Somchai <somchai@example.com>' }] },
    },
    {
      id: 'm2', threadId: 't2', internalDate: String(Date.now() - 86400000),
      payload: { headers: [{ name: 'Subject', value: 'Invoice #1042 due next week' }, { name: 'From', value: 'billing@example.com' }] },
    },
  ];
  return { calendar: events.map(eventToTask), gmail: messages.map(messageToTask) };
}

module.exports = { data };
