"use strict";

const crypto = require("crypto");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();
const db = admin.database();
const EVENT_ID = "live-cafe-rock-2026";
const ADMIN = "admin@bleeditloud.com";
const DOOR = "portero@bleeditloud.com";
const SERIAL_AB = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function fail(code, message) { throw new functions.https.HttpsError(code, message); }
function eventRef() { return db.ref("events/" + EVENT_ID); }
function requireRole(context, roles) {
  const email = context.auth && context.auth.token && String(context.auth.token.email || "").toLowerCase();
  if (!email || !roles.includes(email)) fail("permission-denied", "No tienes permiso para esta operación.");
  return email;
}
function digits(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
function text(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
function hash(v) { return crypto.createHash("sha256").update(String(v).toLowerCase().replace(/\s/g, "")).digest("hex"); }
function genSerial(existing) {
  for (let n = 0; n < 100; n++) {
    let s = "";
    for (let i = 0; i < 8; i++) s += SERIAL_AB[crypto.randomInt(SERIAL_AB.length)];
    if (s.replace(/[^A-Z]/g, "").length >= 2 && !existing[s]) return s;
  }
  fail("resource-exhausted", "No se pudo generar un serial único.");
}
function encryptSerials(dni, phone, serials) {
  if (!phone || !serials.length) return null;
  // Compatible with WebCrypto PBKDF2/AES-GCM used by the current public ticket page.
  const key = crypto.pbkdf2Sync(Buffer.from(phone, "utf8"), Buffer.from("LCR26|" + dni, "utf8"), 150000, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(serials), "utf8")), cipher.final(), cipher.getAuthTag()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64") };
}
function rateLimitKey(context) {
  const ip = context.rawRequest && context.rawRequest.ip || "unknown";
  return hash(ip).slice(0, 40);
}
async function applyRateLimit(context, action, max, windowMs) {
  const ref = db.ref("_security/rateLimits/" + action + "/" + rateLimitKey(context));
  const now = Date.now();
  const result = await ref.transaction((old) => {
    const times = Array.isArray(old) ? old.filter((t) => Number.isFinite(t) && now - t < windowMs) : [];
    if (times.length >= max) return;
    times.push(now);
    return times;
  }, undefined, false);
  if (!result.committed) fail("resource-exhausted", "Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.");
}
function stageConfig(config, stageName) {
  const stages = [
    { name: String(config.s1_name || "Preventa 1"), price: Number(config.s1_price), closed: !!config.s1_closed },
    { name: String(config.s2_name || "Preventa 2"), price: Number(config.s2_price), closed: !!config.s2_closed }
  ];
  const stage = stages.find((s) => s.name === stageName);
  if (!stage || stage.closed || !Number.isFinite(stage.price) || stage.price < 0) fail("failed-precondition", "La etapa seleccionada no está disponible.");
  return stage;
}

exports.createPendingOrder = functions.region("us-central1").https.onCall(async (data, context) => {
  await applyRateLimit(context, "purchase", 8, 10 * 60 * 1000);
  const name = text(data && data.name, 80);
  const dni = digits(data && data.dni);
  const phone = digits(data && data.phone);
  const ref = text(data && data.ref, 80);
  const qty = Number(data && data.qty);
  const stageName = text(data && data.stage, 80);
  if (name.length < 2 || !/^[0-9]{4,12}$/.test(dni) || phone.length < 7 || phone.length > 16 ||
      !Number.isSafeInteger(qty) || qty < 1 || qty > 20 || ref.length < 4 || !stageName) {
    fail("invalid-argument", "Revisa nombre, cédula, teléfono, referencia y cantidad (1–20).");
  }
  const root = await eventRef().once("value");
  const event = root.val() || {};
  const config = event.config || {};
  if (config.sales_paused) fail("failed-precondition", "Las ventas están pausadas.");
  const stage = stageConfig(config, stageName);
  const key = hash(ref);
  const refLock = db.ref("events/" + EVENT_ID + "/paymentRefs/" + key);
  const lock = await refLock.transaction((old) => old ? undefined : { status: "reserved", at: Date.now() }, undefined, false);
  if (!lock.committed) fail("already-exists", "Esta referencia ya fue registrada. Contacta al organizador si se trata de un error.");
  const existing = lock.snapshot.val();
  if (!existing || existing.status !== "reserved") fail("already-exists", "Esta referencia ya fue registrada.");
  const pendingRef = db.ref("events/" + EVENT_ID + "/pending").push();
  const order = {
    name, dni, phone, ref, refKey: key, qty, stage: stage.name,
    total: Math.round(qty * stage.price * 100) / 100,
    ts: Date.now(), status: "pendiente"
  };
  try {
    await pendingRef.set(order);
    await refLock.set({ status: "pending", pid: pendingRef.key, at: Date.now() });
    return { id: pendingRef.key, total: order.total, qty };
  } catch (err) {
    await refLock.remove().catch(() => {});
    await pendingRef.remove().catch(() => {});
    console.error("createPendingOrder failed", err);
    fail("internal", "No se pudo registrar la solicitud. Inténtalo de nuevo.");
  }
});

exports.approvePayment = functions.region("us-central1").https.onCall(async (data, context) => {
  const email = requireRole(context, [ADMIN]);
  const id = text(data && data.id, 128);
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(id)) fail("invalid-argument", "Solicitud inválida.");
  const now = Date.now();
  const initialPending = await eventRef().child("pending/" + id).once("value");
  const initialOrder = initialPending.val();
  const expectedCount = Number(initialOrder && initialOrder.qty);
  const result = await eventRef().transaction((event) => {
    if (!event || !event.pending || !event.pending[id]) return;
    const p = event.pending[id];
    if (p.status !== "pendiente" && p.status !== "processing") return;
    const qty = Number(p.qty);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20) return;
    const dni = digits(p.dni);
    const phone = digits(p.phone);
    const name = text(p.name, 80);
    if (dni.length < 4 || dni.length > 12 || name.length < 2) return;
    const config = event.config || {};
    const stage = stageConfig(config, text(p.stage, 80));
    // Recalculate total using current server config; never trust the browser total.
    p.total = Math.round(stage.price * qty * 100) / 100;
    const day = text(config.active_day || "General", 80);
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    let attendee = attendees.find((a) => a && digits(a.D) === dni && text(a.E_D || "General", 80) === day);
    if (attendee) {
      attendee.C = (Number(attendee.C) || 1) + qty;
      attendee.P = true;
      attendee.N = name || attendee.N;
      attendee.T = phone || digits(attendee.T);
    } else {
      attendee = { N: name, D: dni, E: stage.name, E_D: day, C: qty, T: phone, P: true };
      attendees.push(attendee);
    }
    const tickets = event.tickets || {};
    const mine = Object.values(tickets).filter((t) => t && digits(t.d) === dni && text(t.day || "General", 80) === day);
    let next = mine.reduce((n, t) => Math.max(n, Number(t.i) || 0), 0);
    const created = [];
    for (let i = 0; i < qty; i++) {
      const serial = genSerial(tickets);
      const ticket = { s: serial, d: dni, n: name, e: stage.name, day, i: ++next, u: false, ua: null, ts: now };
      tickets[serial] = ticket;
      created.push(serial);
    }
    event.attendees = attendees;
    event.tickets = tickets;
    event.pending[id] = Object.assign({}, p, { status: "aprobado", approvedAt: now, approvedBy: email });
    event.doorLog = event.doorLog || {};
    const all = Object.values(tickets).filter((t) => t && digits(t.d) === dni);
    const paid = attendees.filter((a) => a && digits(a.D) === dni).every((a) => a.P === true || ["si","pagado","listo","confirmado","cortesia"].includes(String(a.P).toLowerCase()));
    event.pub = event.pub || {};
    event.pub[dni] = { n: name, p: paid, c: all.length, qrs: paid ? encryptSerials(dni, phone, all.map((t) => t.s)) : null };
    const key = p.refKey || hash(p.ref || "");
    event.paymentRefs = event.paymentRefs || {};
    event.paymentRefs[key] = { status: "approved", pid: id, at: now };
    return event;
  }, undefined, false);
  if (!result.committed) fail("failed-precondition", "No se pudo aprobar: la solicitud ya fue procesada o sus datos son inválidos.");
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || expectedCount > 20) fail("failed-precondition", "Cantidad inválida en la solicitud.");
  return { ok: true, count: expectedCount };
});

exports.rejectPayment = functions.region("us-central1").https.onCall(async (data, context) => {
  requireRole(context, [ADMIN]);
  const id = text(data && data.id, 128);
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(id)) fail("invalid-argument", "Solicitud inválida.");
  const ref = eventRef().child("pending/" + id);
  const snap = await ref.once("value");
  const p = snap.val();
  if (!p || p.status !== "pendiente") fail("failed-precondition", "La solicitud ya fue procesada.");
  await ref.update({ status: "rechazado", rejectedAt: Date.now() });
  if (p.refKey) await eventRef().child("paymentRefs/" + p.refKey).update({ status: "rejected", at: Date.now() }).catch(() => {});
  return { ok: true };
});

exports.checkInTicket = functions.region("us-central1").https.onCall(async (data, context) => {
  const email = requireRole(context, [ADMIN, DOOR]);
  const serial = text(data && data.serial, 16).toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(serial)) fail("invalid-argument", "Serial inválido.");
  const now = Date.now();
  const result = await eventRef().child("tickets/" + serial).transaction((ticket) => {
    if (!ticket || ticket.u === true) return;
    ticket.u = true;
    ticket.ua = now;
    return ticket;
  }, undefined, false);
  if (!result.committed) {
    const t = result.snapshot && result.snapshot.val();
    return { ok: false, alreadyUsed: !!(t && t.u === true), exists: !!t };
  }
  await eventRef().child("doorLog/" + serial).set({ ts: now, by: email });
  return { ok: true, ts: now };
});

exports.getPublicTicketInfo = functions.region("us-central1").https.onCall(async (data, context) => {
  await applyRateLimit(context, "ticketInfo", 30, 10 * 60 * 1000);
  const serial = text(data && data.serial, 16).toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(serial)) fail("invalid-argument", "Serial inválido.");
  const snap = await eventRef().child("tickets/" + serial).once("value");
  const t = snap.val();
  if (!t) return { exists: false };
  // Return only fields used by the public ticket display; never return DNI or phone.
  return { exists: true, e: text(t.e, 80), day: text(t.day, 80), i: Number(t.i) || 0, u: t.u === true };
});
