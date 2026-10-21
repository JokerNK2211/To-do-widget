# To-do widget

วิดเจ็ต To-do บนเดสก์ท็อปที่ดึงนัดหมายจาก Google Calendar และอีเมลจาก Gmail มาแสดงเป็นรายการงาน พร้อมเพิ่มงานเองได้

A small always-on-top desktop widget (Electron) that turns Google Calendar events and Gmail messages into a to-do list, alongside tasks you add yourself. Works on Windows, macOS and Linux.

![Demo](docs/demo.png)

## Features

- งานจาก **ปฏิทิน**: นัดหมายตั้งแต่วันนี้ถึง 7 วันข้างหน้า (ปรับได้) จากปฏิทินที่เลือก
- งานจาก **อีเมล**: อีเมลที่ติดดาว หรือยังไม่อ่านในกล่องจดหมายภายใน 7 วัน (ปรับคำค้น Gmail ได้)
- **เพิ่มงานเอง** พร้อมวันครบกำหนด
- จัดกลุ่ม: เลยกำหนด / วันนี้ / พรุ่งนี้ / ถัดไป / จากอีเมล
- ติ๊กเสร็จ, ซ่อนรายการ, เปิดต้นฉบับใน Calendar/Gmail
- ซิงก์อัตโนมัติทุก 10 นาที, แสดงอยู่บนสุดเสมอ (ปิดได้)
- อ่านข้อมูล Google แบบ read-only เท่านั้น ไม่แก้ไขปฏิทินหรืออีเมล

## Try it without Google (demo mode)

```bash
npm install
npm run demo
```

## Connect your Google account

The app signs in with your own Google Cloud OAuth client, so your data goes straight from Google to your computer.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API**.
3. **APIs & Services → OAuth consent screen**: choose *External* (or *Internal* for a Workspace domain such as `the-annapolis.com`), fill in the app name, and add your email under **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type **Desktop app**. Download the JSON.
5. Save it as `credentials.json` in this folder (or in the app's user-data folder; the widget shows the exact path).
6. `npm start`, click **เข้าสู่ระบบด้วย Google**, and pick your account.

In ⚙ settings you can set the Google account you expect (e.g. `nakorn@the-annapolis.com`). It is used as the sign-in hint, and the widget warns if you signed in with a different account.

### Settings

| Setting | Default |
| --- | --- |
| Gmail query | `in:inbox (is:starred OR (is:unread newer_than:7d))` |
| Calendars | `primary` (comma-separated calendar IDs) |
| Days ahead | 7 |
| Always on top | on |

Local state (tokens, your tasks, done/hidden items) is stored in `state.json` in Electron's user-data folder.

## Development

```bash
npm test     # unit tests for the Calendar/Gmail → task conversion
```

- `src/main.js`: window, sync loop, local state, IPC
- `src/google.js`: OAuth (loopback + PKCE) and Calendar/Gmail REST calls
- `src/tasks.js`: pure conversion, merge and grouping logic
- `src/renderer/`: widget UI
