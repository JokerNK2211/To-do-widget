// Google sign-in (OAuth 2.0 loopback flow with PKCE, as Google recommends for
// desktop apps) and the two read-only API calls the widget needs.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { shell } = require('electron');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function loadClient(credentialsPath) {
  if (!fs.existsSync(credentialsPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const c = raw.installed || raw.web || raw;
    return c.client_id ? { clientId: c.client_id, clientSecret: c.client_secret } : null;
  } catch {
    return null;
  }
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function postToken(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token request failed: ${body.error_description || body.error}`);
  return body;
}

// Opens the browser, waits for Google to redirect back to a local port,
// and exchanges the code for tokens.
function signIn(client, loginHint) {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const ok = code && url.searchParams.get('state') === state;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok
        ? '<p>เข้าสู่ระบบสำเร็จ ปิดหน้านี้ได้เลย / Signed in. You can close this tab.</p>'
        : '<p>เข้าสู่ระบบไม่สำเร็จ / Sign-in failed.</p>');
      server.close();
      if (!ok) return reject(new Error(url.searchParams.get('error') || 'Sign-in failed'));
      try {
        const tokens = await postToken({
          code,
          client_id: client.clientId,
          client_secret: client.clientSecret,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        });
        resolve(withExpiry(tokens));
      } catch (err) {
        reject(err);
      }
    });

    let redirectUri;
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      if (loginHint) params.set('login_hint', loginHint);
      shell.openExternal(`${AUTH_URL}?${params}`);
    });
    setTimeout(() => {
      server.close();
      reject(new Error('Sign-in timed out'));
    }, 5 * 60 * 1000).unref();
  });
}

function withExpiry(tokens) {
  return { ...tokens, expires_at: Date.now() + (tokens.expires_in - 60) * 1000 };
}

async function freshTokens(client, tokens) {
  if (tokens.expires_at > Date.now()) return tokens;
  const refreshed = await postToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  return withExpiry({ ...tokens, ...refreshed });
}

async function api(tokens, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function userEmail(tokens) {
  const info = await api(tokens, 'https://openidconnect.googleapis.com/v1/userinfo');
  return info.email;
}

// Upcoming events across the chosen calendars for the next `days` days.
async function fetchEvents(tokens, { calendarIds = ['primary'], days = 7 } = {}) {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getTime() + days * 86400000).toISOString();
  const lists = await Promise.all(calendarIds.map((id) => {
    const params = new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
    });
    return api(tokens, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${params}`);
  }));
  return lists.flatMap((l) => l.items || []).filter((e) => e.status !== 'cancelled');
}

// Messages matching the Gmail search query, with just the headers we show.
async function fetchMessages(tokens, { query, max = 25 }) {
  const params = new URLSearchParams({ q: query, maxResults: String(max) });
  const list = await api(tokens, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
  const ids = (list.messages || []).map((m) => m.id);
  const meta = 'format=metadata&metadataHeaders=Subject&metadataHeaders=From';
  const messages = await Promise.all(ids.map((id) =>
    api(tokens, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${meta}`)));
  // One task per thread: keep the newest message of each thread.
  const byThread = new Map();
  for (const m of messages) {
    const prev = byThread.get(m.threadId);
    if (!prev || Number(m.internalDate) > Number(prev.internalDate)) byThread.set(m.threadId, m);
  }
  return [...byThread.values()];
}

module.exports = { loadClient, signIn, freshTokens, userEmail, fetchEvents, fetchMessages };
