const TOKEN_SCOPE = "https://www.googleapis.com/auth/firebase.database";
const EVENT_ID = "live-cafe-rock-2026";
const ADMIN_EMAIL = "admin@bleeditloud.com";
const DOOR_EMAIL = "portero@bleeditloud.com";
const SERIAL_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
let cachedAccessToken = null;
let tokenExpiresAt = 0;
const localLimits = new Map();

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const decodeB64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const encodeB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const decodeB64Text = (s) => new TextDecoder().decode(decodeB64(s));
const digits = (v) => String(v == null ? "" : v).replace(/\D/g, "");
const clean = (v, max = 100) => String(v == null ? "" : v).trim().slice(0, max);
const refHash = async (v) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(v).toLowerCase().replace(/\s/g, "")));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
};
const safeClone = (v) => v == null ? {} : JSON.parse(JSON.stringify(v));

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-max-age": "86400",
      "vary": "Origin"
    };
  }
  return {};
}
function checkOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return;
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new ApiError(403, "Origen web no autorizado. Revisa ALLOWED_ORIGINS en Cloudflare.");
}
function rateLimit(request, action, max, windowMs) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = action + ":" + ip;
  const now = Date.now();
  const old = localLimits.get(key) || [];
  const fresh = old.filter(t => now - t < windowMs);
  if (fresh.length >= max) throw new ApiError(429, "Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.");
  fresh.push(now);
  localLimits.set(key, fresh);
  if (localLimits.size > 5000) {
    for (const [k, v] of localLimits) if (!v.length || now - v[v.length - 1] > windowMs * 2) localLimits.delete(k);
  }
}

async function accessToken(env) {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) return cachedAccessToken;
  let sa;
  try { sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON || ""); }
  catch { throw new ApiError(500, "Falta configurar el secreto GOOGLE_SERVICE_ACCOUNT_JSON."); }
  if (!sa.client_email || !sa.private_key) throw new ApiError(500, "El secreto de la cuenta de servicio está incompleto.");
  const pem = sa.private_key.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", decodeB64(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email, scope: TOKEN_SCOPE, aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600
  })));
  const unsigned = header + "." + claim;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new ApiError(502, "No se pudo autenticar el backend con Google Cloud.");
  cachedAccessToken = result.access_token;
  tokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

function dbUrl(env, path = "") {
  const base = String(env.FIREBASE_DATABASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new ApiError(500, "Falta FIREBASE_DATABASE_URL.");
  const parts = path ? path.split("/").map(encodeURIComponent).join("/") : "";
  return base + "/events/" + encodeURIComponent(EVENT_ID) + (parts ? "/" + parts : "") + ".json";
}
async function dbGet(env, path = "") {
  const token = await accessToken(env);
  const response = await fetch(dbUrl(env, path), { headers: { authorization: "Bearer " + token, "X-Firebase-ETag": "true" } });
  if (!response.ok) throw new ApiError(502, "No se pudo consultar Realtime Database.");
  return { value: await response.json(), etag: response.headers.get("ETag") };
}
async function dbPut(env, path, value, etag = null) {
  const token = await accessToken(env);
  const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
  if (etag) headers["if-match"] = etag;
  return fetch(dbUrl(env, path), { method: "PUT", headers, body: JSON.stringify(value) });
}
async function eventTransaction(env, mutate, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    const snap = await dbGet(env);
    const event = safeClone(snap.value);
    const result = await mutate(event);
    const response = await dbPut(env, "", event, snap.etag);
    if (response.status === 412) continue;
    if (!response.ok) throw new ApiError(502, "No se pudo guardar el cambio en Realtime Database.");
    return result;
  }
  throw new ApiError(409, "El evento está recibiendo cambios simultáneos. Inténtalo otra vez.");
}
async function verifyUser(request, env, allowedEmails) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "Inicia sesión para realizar esta operación.");
  const url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(env.FIREBASE_WEB_API_KEY);
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: match[1] })
  });
  if (!response.ok) throw new ApiError(401, "La sesión no es válida o ha caducado.");
  const data = await response.json();
  const user = data.users && data.users[0];
  const email = String(user && user.email || "").toLowerCase();
  if (!email || !allowedEmails.includes(email)) throw new ApiError(403, "No tienes permisos para esta operación.");
  return email;
}
function configStage(config, stageName) {
  if (config.sales_paused === true) throw new ApiError(409, "Las ventas están pausadas.");
  const options = [
    { name: String(config.s1_name || "Preventa 1"), price: Number(config.s1_price), closed: config.s1_closed === true },
    { name: String(config.s2_name || "Preventa 2"), price: Number(config.s2_price), closed: config.s2_closed === true }
  ];
  const stage = options.find(s => s.name === stageName);
  if (!stage || stage.closed || !Number.isFinite(stage.price) || stage.price < 0) throw new ApiError(409, "La etapa seleccionada no está disponible.");
  return stage;
}
function newSerial(tickets) {
  for (let attempt = 0; attempt < 100; attempt++) {
    let s = "";
    for (let i = 0; i < 8; i++) s += SERIAL_CHARS[crypto.getRandomValues(new Uint8Array(1))[0] % SERIAL_CHARS.length];
    if (s.replace(/[^A-Z]/g, "").length >= 2 && !tickets[s]) return s;
  }
  throw new ApiError(500, "No se pudo generar un serial único.");
}
async function decryptSerials(dni, phone, blob) {
  if (!blob || !blob.iv || !blob.ct) return null;
  try {
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(phone), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({
      name: "PBKDF2", salt: new TextEncoder().encode("LCR26|" + dni), iterations: 150000, hash: "SHA-256"
    }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeB64(blob.iv) }, key, decodeB64(blob.ct));
    const serials = JSON.parse(new TextDecoder().decode(plaintext));
    return Array.isArray(serials) && serials.every(s => typeof s === "string" && /^[A-Z2-9]{8}$/.test(s)) ? serials : null;
  } catch { return null; }
}

async function createPendingOrder(request, env, data) {
  rateLimit(request, "purchase", 8, 10 * 60 * 1000);
  const name = clean(data.name, 80), dni = digits(data.dni), phone = digits(data.phone);
  const ref = clean(data.ref, 80), qty = Number(data.qty), stageName = clean(data.stage, 80);
  if (name.length < 2 || !/^[0-9]{5,12}$/.test(dni) || phone.length < 7 || phone.length > 16 ||
      !Number.isSafeInteger(qty) || qty < 1 || qty > 20 || ref.length < 4 || !stageName) {
    throw new ApiError(400, "Revisa nombre, cédula, teléfono, referencia y cantidad (1–20).");
  }
  const key = await refHash(ref);
  return eventTransaction(env, async event => {
    event.config = event.config || {};
    event.pending = event.pending || {};
    event._security = event._security || {};
    event._security.refs = event._security.refs || {};
    if (event.config.sales_paused === true) throw new ApiError(409, "Las ventas están pausadas.");
    const stage = configStage(event.config, stageName);
    if (event._security.refs[key]) throw new ApiError(409, "Esta referencia ya fue registrada.");
    for (const [id, p] of Object.entries(event.pending)) {
      if (p && p.status !== "rechazado" && await refHash(p.ref || "") === key) {
        throw new ApiError(409, "Esta referencia ya aparece en otra solicitud.");
      }
    }
    const id = crypto.randomUUID().replace(/-/g, "");
    const total = Math.round(qty * stage.price * 100) / 100;
    event.pending[id] = { name, dni, phone, ref, refKey: key, qty, stage: stage.name, total, ts: Date.now(), status: "pendiente" };
    event._security.refs[key] = id;
    return { id, total, qty };
  });
}

async function approvePayment(request, env, data) {
  const email = await verifyUser(request, env, [ADMIN_EMAIL]);
  const id = clean(data.id, 128);
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(id)) throw new ApiError(400, "Solicitud inválida.");
  const result = await eventTransaction(env, event => {
    event.config = event.config || {};
    event.pending = event.pending || {};
    const p = event.pending[id];
    if (!p) throw new ApiError(409, "La solicitud ya fue procesada.");
    const qty = Number(p.qty), dni = digits(p.dni), phone = digits(p.phone), name = clean(p.name, 80);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20 || dni.length < 5 || dni.length > 12 || name.length < 2) {
      throw new ApiError(400, "Los datos de la solicitud no son válidos.");
    }
    const stage = configStage(event.config, clean(p.stage, 80));
    p.total = Math.round(stage.price * qty * 100) / 100;
    const day = clean(event.config.active_day || "General", 80);
    event.attendees = Array.isArray(event.attendees) ? event.attendees : [];
    let attendee = event.attendees.find(a => a && digits(a.D) === dni && clean(a.E_D || "General", 80) === day);
    if (attendee) {
      attendee.C = (Number(attendee.C) || 1) + qty;
      attendee.P = true;
      attendee.N = name || attendee.N;
      if (phone) attendee.T = phone;
      attendee.E = stage.name;
    } else {
      attendee = { N: name, D: dni, E: stage.name, E_D: day, C: qty, T: phone, P: true };
      event.attendees.push(attendee);
    }
    event.tickets = event.tickets || {};
    const mine = Object.values(event.tickets).filter(t => t && digits(t.d) === dni && clean(t.day || "General", 80) === day);
    let next = mine.reduce((n, t) => Math.max(n, Number(t.i) || 0), 0);
    for (let i = 0; i < qty; i++) {
      const serial = newSerial(event.tickets);
      event.tickets[serial] = { s: serial, d: dni, n: name, e: stage.name, day, i: ++next, u: false, ua: null, ts: Date.now() };
    }
    delete event.pending[id];
    event.pub = event.pub || {};
    const allTickets = Object.values(event.tickets).filter(t => t && digits(t.d) === dni);
    event.pub[dni] = { n: name, p: true, c: allTickets.length, qrs: null };
    return { id, dni, phone, serials: allTickets.map(t => t.s), count: qty, approvedBy: email };
  });
  return { ok: true, ...result };
}

async function setPublicIndex(request, env, data) {
  await verifyUser(request, env, [ADMIN_EMAIL]);
  const dni = digits(data.dni);
  const qrs = data.qrs && typeof data.qrs.iv === "string" && typeof data.qrs.ct === "string" ? data.qrs : null;
  if (!/^[0-9]{5,12}$/.test(dni)) throw new ApiError(400, "Cédula inválida.");
  return eventTransaction(env, event => {
    const rows = (Array.isArray(event.attendees) ? event.attendees : []).filter(a => a && digits(a.D) === dni);
    if (!rows.length) throw new ApiError(404, "No hay asistentes para actualizar.");
    const tickets = Object.values(event.tickets || {}).filter(t => t && digits(t.d) === dni);
    const name = (rows.find(a => a.N) || {}).N || "";
    const paid = rows.every(a => a.P === true || ["si", "pagado", "listo", "confirmado", "cortesia"].includes(String(a.P).toLowerCase()));
    const phone = (rows.find(a => a.T) || {}).T;
    event.pub = event.pub || {};
    event.pub[dni] = { n: clean(name, 80), p: paid, c: tickets.length, qrs: paid ? qrs : null };
    return { ok: true };
  });
}

async function rejectPayment(request, env, data) {
  await verifyUser(request, env, [ADMIN_EMAIL]);
  const id = clean(data.id, 128);
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(id)) throw new ApiError(400, "Solicitud inválida.");
  return eventTransaction(env, event => {
    if (!event.pending || !event.pending[id]) throw new ApiError(409, "La solicitud ya fue procesada.");
    delete event.pending[id];
    return { ok: true };
  });
}

async function checkInTicket(request, env, data) {
  const email = await verifyUser(request, env, [ADMIN_EMAIL, DOOR_EMAIL]);
  const serial = clean(data.serial, 16).toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(serial)) throw new ApiError(400, "Serial inválido.");
  return eventTransaction(env, event => {
    const ticket = event.tickets && event.tickets[serial];
    if (!ticket) return { ok: false, exists: false, alreadyUsed: false };
    if (ticket.u === true) return { ok: false, exists: true, alreadyUsed: true };
    const ts = Date.now();
    ticket.u = true;
    ticket.ua = ts;
    event.doorLog = event.doorLog || {};
    event.doorLog[serial] = { ts, by: email };
    return { ok: true, ts };
  });
}

async function getPublicOrderIndex(request, env, data) {
  rateLimit(request, "orderLookup", 20, 10 * 60 * 1000);
  const dni = digits(data.dni), phone = digits(data.phone);
  if (!/^[0-9]{5,12}$/.test(dni) || phone.length < 7 || phone.length > 16) return { found: false };
  const snap = await dbGet(env);
  const event = snap.value || {};
  const p = event.pub && event.pub[dni];
  if (p && p.p === true && p.qrs) {
    const serials = await decryptSerials(dni, phone, p.qrs);
    if (!serials || !serials.length) return { found: false };
    return { found: true, status: "paid", p: true, c: Number(p.c) || serials.length, n: clean(p.n, 80), serials };
  }
  const pending = Object.values(event.pending || {}).find(x => x && digits(x.dni) === dni && digits(x.phone) === phone && x.status === "pendiente");
  if (pending) return { found: true, status: "pending", p: false, n: clean(pending.name, 80), c: Number(pending.qty) || 1 };
  return { found: false };
}

async function getPublicTicketInfo(request, env, data) {
  rateLimit(request, "ticketLookup", 60, 10 * 60 * 1000);
  const serial = clean(data.serial, 16).toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(serial)) throw new ApiError(400, "Serial inválido.");
  const snap = await dbGet(env, "tickets/" + serial);
  const t = snap.value;
  if (!t) return { exists: false };
  return { exists: true, e: clean(t.e, 80), day: clean(t.day || "General", 80), i: Number(t.i) || 0, u: t.u === true };
}

async function route(request, env) {
  checkOrigin(request, env);
  if (request.method !== "POST") throw new ApiError(405, "Usa POST para esta operación.");
  const data = await request.json().catch(() => { throw new ApiError(400, "El cuerpo debe ser JSON válido."); });
  switch (new URL(request.url).pathname.replace(/^\/+|\/+$/g, "")) {
    case "createPendingOrder": return createPendingOrder(request, env, data);
    case "approvePayment": return approvePayment(request, env, data);
    case "rejectPayment": return rejectPayment(request, env, data);
    case "checkInTicket": return checkInTicket(request, env, data);
    case "setPublicIndex": return setPublicIndex(request, env, data);
    case "getPublicOrderIndex": return getPublicOrderIndex(request, env, data);
    case "getPublicTicketInfo": return getPublicTicketInfo(request, env, data);
    default: throw new ApiError(404, "Operación no encontrada.");
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (!Object.keys(cors).length) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      const result = await route(request, env);
      return json(result, 200, cors);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error("Worker error", error && error.message);
      return json({ error: status === 500 ? "Error interno del servicio." : error.message }, status, cors);
    }
  }
};
