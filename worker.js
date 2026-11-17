// GFC Coeliac Guide - community boards API (Gate C v1)
// Serves /api/* from D1; everything else falls through to static assets.
// Rules locked by Tee: instant publish (WikiCamps model), no DMs,
// trust = club removes spam after the fact (Report button + club badge).
const BOARDS = ['seq', 'north-qld', 'out-west', 'melbourne', 'sydney'];
const COOKIE = 'gfapp_session';

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });

const bad = (msg, status) => json({ error: msg }, status || 400);

function cookieGet(req, name) {
  const c = req.headers.get('Cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function hashPassword(password, salt) {
  // PBKDF2-SHA256, 100k iters (Cloudflare Workers cap = 100,000)
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    .then(key => crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 },
      key, 256))
    .then(buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''));
}

const randomToken = n => {
  const bytes = new Uint8Array(n || 32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

async function memberFromReq(req, env) {
  const token = cookieGet(req, COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT m.id, m.name, m.is_club FROM sessions s JOIN members m ON m.id = s.member_id
     WHERE s.token = ?1`).bind(token).first();
  return row || null;
}

const sessionHeaders = token => ({
  'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
});

const clean = (s, max) => (s || '').replace(/\s+/g, ' ').trim().slice(0, max || 0) || '';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(req);
    }
    try {
      return await route(req, env, path);
    } catch (e) {
      return bad('Something went wrong - try again.', 500);
    }
  }
};

async function route(req, env, path) {
  const url = new URL(req.url);
  const me = await memberFromReq(req, env);
  const m = path;

  // ---------- auth ----------
  if (m === '/api/signup' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const name = clean(b.name, 30);
    const email = (b.email || '').trim().toLowerCase().slice(0, 120);
    const pass = b.password || '';
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pass.length < 8)
      return bad('Need a display name, a real email and a password of 8+ characters.');
    const exists = await env.DB.prepare('SELECT id FROM members WHERE email = ?1').bind(email).first();
    if (exists) return bad('That email is already registered - try logging in.');
    const salt = randomToken(16);
    const hash = await hashPassword(pass, salt);
    const r = await env.DB.prepare(
      'INSERT INTO members (name, email, pass_hash, salt) VALUES (?1, ?2, ?3, ?4) RETURNING id')
      .bind(name, email, hash, salt).first();
    const token = randomToken(32);
    await env.DB.prepare('INSERT INTO sessions (token, member_id) VALUES (?1, ?2)')
      .bind(token, r.id).run();
    return json({ ok: true, name, is_club: 0 }, 200, sessionHeaders(token));
  }

  if (m === '/api/login' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const email = (b.email || '').trim().toLowerCase();
    const row = await env.DB.prepare('SELECT * FROM members WHERE email = ?1').bind(email).first();
    if (!row) return bad('No account with that email - check it or sign up.', 404);
    const hash = await hashPassword(b.password || '', row.salt);
    if (hash !== row.pass_hash) return bad('Wrong password - try again.', 401);
    const token = randomToken(32);
    await env.DB.prepare('INSERT INTO sessions (token, member_id) VALUES (?1, ?2)')
      .bind(token, row.id).run();
    return json({ ok: true, name: row.name, is_club: row.is_club }, 200, sessionHeaders(token));
  }

  if (m === '/api/logout' && req.method === 'POST') {
    const token = cookieGet(req, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(token).run();
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0` });
  }

  if (m === '/api/me' && req.method === 'GET') {
    return json(me ? { ok: true, name: me.name, is_club: me.is_club } : { ok: false });
  }

  // ---------- boards ----------
  if (m === '/api/posts' && req.method === 'GET') {
    const board = url.searchParams.get('board') || 'seq';
    if (!BOARDS.includes(board)) return bad('Unknown board.');
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.text, p.created_at, p.venue_idx, m.name, m.is_club,
        (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.hidden = 0) AS replies
       FROM posts p JOIN members m ON m.id = p.member_id
       WHERE p.board = ?1 AND p.hidden = 0
       ORDER BY p.created_at DESC LIMIT 50`).bind(board).all();
    return json({ ok: true, board, posts: results });
  }

  if (m === '/api/posts' && req.method === 'POST') {
    if (!me) return bad('Log in to post.', 401);
    const b = await req.json().catch(() => ({}));
    const board = BOARDS.includes(b.board) ? b.board : null;
    const text = clean(b.text, 1000);
    if (!board) return bad('Unknown board.');
    if (text.length < 2) return bad('Say a little more than that.');
    // gentle rate limit: 5 posts per hour per member
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM posts WHERE member_id = ?1 AND created_at > datetime('now','-1 hour')`)
      .bind(me.id).first();
    if (recent.n >= 5) return bad('Easy tiger - 5 posts an hour max. Try again a bit later.', 429);
    const r = await env.DB.prepare(
      'INSERT INTO posts (board, member_id, text, venue_idx) VALUES (?1, ?2, ?3, ?4) RETURNING id')
      .bind(board, me.id, text, b.venue_idx || null).first();
    return json({ ok: true, id: r.id, name: me.name, is_club: me.is_club });
  }

  const postMatch = m.match(/^\/api\/posts\/(\d+)$/);
  if (postMatch && req.method === 'GET') {
    const id = +postMatch[1];
    const post = await env.DB.prepare(
      `SELECT p.id, p.board, p.text, p.created_at, p.venue_idx, m.name, m.is_club
       FROM posts p JOIN members m ON m.id = p.member_id
       WHERE p.id = ?1 AND p.hidden = 0`).bind(id).first();
    if (!post) return bad('Post not found.', 404);
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.text, r.created_at, m.name, m.is_club
       FROM replies r JOIN members m ON m.id = r.member_id
       WHERE r.post_id = ?1 AND r.hidden = 0 ORDER BY r.created_at LIMIT 100`).bind(id).all();
    return json({ ok: true, post, replies: results });
  }

  const replyMatch = m.match(/^\/api\/posts\/(\d+)\/replies$/);
  if (replyMatch && req.method === 'POST') {
    if (!me) return bad('Log in to reply.', 401);
    const id = +replyMatch[1];
    const b = await req.json().catch(() => ({}));
    const text = clean(b.text, 1000);
    if (text.length < 1) return bad('Say something first.');
    const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?1 AND hidden = 0').bind(id).first();
    if (!post) return bad('Post not found.', 404);
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM replies WHERE member_id = ?1 AND created_at > datetime('now','-1 hour')`)
      .bind(me.id).first();
    if (recent.n >= 10) return bad('Easy tiger - 10 replies an hour max.', 429);
    const r = await env.DB.prepare(
      'INSERT INTO replies (post_id, member_id, text) VALUES (?1, ?2, ?3) RETURNING id')
      .bind(id, me.id, text).first();
    return json({ ok: true, id: r.id, name: me.name, is_club: me.is_club });
  }

  // ---------- reports (club moderation) ----------
  if (m === '/api/reports' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const kind = b.kind === 'reply' ? 'reply' : b.kind === 'post' ? 'post' : null;
    if (!kind || !b.id) return bad('What are you reporting?');
    await env.DB.prepare('INSERT INTO reports (kind, target_id, member_id, reason) VALUES (?1, ?2, ?3, ?4)')
      .bind(kind, +b.id, me ? me.id : null, clean(b.reason, 300)).run();
    return json({ ok: true });
  }

  // ---------- club admin (hidden/reveal via club account) ----------
  if (m.startsWith('/api/admin/') && req.method === 'POST') {
    if (!me || !me.is_club) return bad('Club admins only.', 403);
    const hm = m.match(/^\/api\/admin\/(posts|replies)\/(\d+)\/(hide|unhide)$/);
    if (!hm) return bad('Unknown admin action.');
    await env.DB.prepare(`UPDATE ${hm[1]} SET hidden = ?1 WHERE id = ?2`)
      .bind(hm[3] === 'hide' ? 1 : 0, +hm[2]).run();
    return json({ ok: true });
  }

  return bad('Not found.', 404);
}