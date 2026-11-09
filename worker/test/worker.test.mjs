import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import worker from "../src/index.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

const env = {
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "bleeditloud-test@bleeditloud-6fb33.iam.gserviceaccount.com",
    private_key: privateKey
  }),
  FIREBASE_DATABASE_URL: "https://bleeditloud-test-default-rtdb.firebaseio.com",
  FIREBASE_WEB_API_KEY: "test-web-api-key",
  ALLOWED_ORIGINS: "https://luiskabuto.github.io"
};

let eventData;
let etagVersion = 0;
let requestCounter = 0;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function readPath(root, parts) {
  return parts.reduce((value, key) => value == null ? null : value[key], root);
}
function writePath(root, parts, value) {
  if (!parts.length) return value;
  let node = root;
  for (const key of parts.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  if (value === null) delete node[parts[parts.length - 1]];
  else node[parts[parts.length - 1]] = value;
  return root;
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);

  if (url.hostname === "oauth2.googleapis.com") {
    return new Response(JSON.stringify({ access_token: "test-google-access-token", expires_in: 3600 }), { status: 200 });
  }

  if (url.hostname === "identitytoolkit.googleapis.com") {
    const body = JSON.parse(init.body || "{}");
    const users = {
      "admin-token": { email: "admin@bleeditloud.com" },
      "door-token": { email: "portero@bleeditloud.com" },
      "other-token": { email: "other@example.com" }
    };
    const user = users[body.idToken];
    return user
      ? new Response(JSON.stringify({ users: [user] }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: "INVALID_ID_TOKEN" } }), { status: 400 });
  }

  if (url.hostname === "bleeditloud-test-default-rtdb.firebaseio.com") {
    const match = url.pathname.match(/^\/events\/live-cafe-rock-2026(?:\/(.*))?\.json$/);
    if (!match) return new Response("not found", { status: 404 });
    const parts = match[1] ? match[1].split("/").map(decodeURIComponent) : [];

    if (init.method === "PUT") {
      const headers = new Headers(init.headers || {});
      if (headers.get("if-match") !== `"${etagVersion}"`) return new Response("", { status: 412 });
      const value = JSON.parse(init.body || "null");
      eventData = writePath(eventData, parts, value);
      etagVersion += 1;
      return new Response(JSON.stringify(value), { status: 200 });
    }

    return new Response(JSON.stringify(clone(readPath(eventData, parts))), {
      status: 200,
      headers: { ETag: `"${etagVersion}"` }
    });
  }

  throw new Error("Unexpected fetch in test: " + url.href);
};

function request(action, payload = {}, token = null, origin = "https://luiskabuto.github.io") {
  requestCounter += 1;
  const headers = {
    "content-type": "application/json",
    "origin": origin,
    "cf-connecting-ip": "198.51.100." + ((requestCounter % 200) + 1)
  };
  if (token) headers.authorization = "Bearer " + token;
  return worker.fetch(new Request("https://bleeditloud-api.test/" + action, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  }), env);
}

async function body(response) {
  return response.json();
}

beforeEach(() => {
  eventData = {
    config: {
      s1_name: "Preventa 1",
      s1_price: 10,
      s1_closed: false,
      s2_name: "Preventa 2",
      s2_price: 15,
      s2_closed: false,
      sales_paused: false,
      active_day: "General"
    },
    pending: {},
    attendees: [],
    tickets: {},
    pub: {},
    doorLog: {},
    _security: { refs: {} }
  };
  etagVersion = 0;
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("registra una solicitud pendiente y calcula el total en el servidor", async () => {
  const response = await request("createPendingOrder", {
    name: "Comprador de prueba",
    dni: "12345678",
    phone: "04141234567",
    qty: 2,
    ref: "REF-1001",
    stage: "Preventa 1"
  });
  const result = await body(response);
  assert.equal(response.status, 200);
  assert.equal(result.total, 20);
  assert.equal(result.qty, 2);
  assert.ok(eventData.pending[result.id]);
  assert.equal(eventData.pending[result.id].status, "pendiente");
});

test("rechaza referencias bancarias duplicadas", async () => {
  const payload = { name: "Comprador", dni: "12345678", phone: "04141234567", qty: 1, ref: "REF-2002", stage: "Preventa 1" };
  const first = await request("createPendingOrder", payload);
  const second = await request("createPendingOrder", { ...payload, ref: " ref-2002 " });
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
});

test("rechaza cantidades fuera del rango permitido", async () => {
  const response = await request("createPendingOrder", {
    name: "Comprador",
    dni: "12345678",
    phone: "04141234567",
    qty: 21,
    ref: "REF-3003",
    stage: "Preventa 1"
  });
  assert.equal(response.status, 400);
});

test("no registra compras cuando las ventas están pausadas o la etapa cerrada", async () => {
  eventData.config.sales_paused = true;
  const paused = await request("createPendingOrder", {
    name: "Comprador", dni: "12345678", phone: "04141234567", qty: 1, ref: "REF-4004", stage: "Preventa 1"
  });
  assert.equal(paused.status, 409);

  eventData.config.sales_paused = false;
  eventData.config.s1_closed = true;
  const closed = await request("createPendingOrder", {
    name: "Comprador", dni: "12345678", phone: "04141234567", qty: 1, ref: "REF-4005", stage: "Preventa 1"
  });
  assert.equal(closed.status, 409);
});

test("solo el administrador puede aprobar pagos", async () => {
  const order = await request("createPendingOrder", {
    name: "Comprador", dni: "12345678", phone: "04141234567", qty: 1, ref: "REF-5005", stage: "Preventa 1"
  });
  const pending = await body(order);
  const response = await request("approvePayment", { id: pending.id }, "door-token");
  assert.equal(response.status, 403);
  assert.ok(eventData.pending[pending.id]);
});

test("aprobar un pago emite la cantidad exacta de entradas", async () => {
  const order = await request("createPendingOrder", {
    name: "Comprador", dni: "12345678", phone: "04141234567", qty: 2, ref: "REF-6006", stage: "Preventa 1"
  });
  const pending = await body(order);
  const response = await request("approvePayment", { id: pending.id }, "admin-token");
  const result = await body(response);
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.serials.length, 2);
  assert.equal(Object.keys(eventData.tickets).length, 2);
  assert.equal(eventData.attendees[0].C, 2);
  assert.equal(eventData.pending[pending.id], undefined);
});

test("el modo puerta marca un serial una sola vez", async () => {
  eventData.tickets.ABCD2345 = { s: "ABCD2345", d: "12345678", n: "Comprador", day: "General", i: 1, u: false };
  const first = await request("checkInTicket", { serial: "ABCD2345" }, "door-token");
  const firstResult = await body(first);
  assert.equal(first.status, 200);
  assert.equal(firstResult.ok, true);
  assert.equal(eventData.tickets.ABCD2345.u, true);

  const second = await request("checkInTicket", { serial: "ABCD2345" }, "door-token");
  const secondResult = await body(second);
  assert.equal(second.status, 200);
  assert.equal(secondResult.ok, false);
  assert.equal(secondResult.alreadyUsed, true);
});

test("rechaza orígenes web no autorizados", async () => {
  const response = await request("createPendingOrder", {}, null, "https://sitio-no-autorizado.example");
  assert.equal(response.status, 403);
});

test("rechaza seriales con formato inválido", async () => {
  const response = await request("checkInTicket", { serial: "ABC-123" }, "door-token");
  assert.equal(response.status, 400);
});

test("una referencia rechazada no puede reutilizarse", async () => {
  const payload = { name: "Comprador", dni: "12345678", phone: "04141234567", qty: 1, ref: "REF-REJECT-1", stage: "Preventa 1" };
  const order = await request("createPendingOrder", payload);
  const pending = await body(order);
  const rejected = await request("rejectPayment", { id: pending.id }, "admin-token");
  assert.equal(rejected.status, 200);
  assert.equal(eventData.pending[pending.id], undefined);

  const reused = await request("createPendingOrder", payload);
  assert.equal(reused.status, 409);
});

test("dos lectores concurrentes no pueden consumir el mismo serial", async () => {
  eventData.tickets.WXYZ2345 = { s: "WXYZ2345", d: "12345678", n: "Comprador", day: "General", i: 1, u: false };
  const [first, second] = await Promise.all([
    request("checkInTicket", { serial: "WXYZ2345" }, "door-token"),
    request("checkInTicket", { serial: "WXYZ2345" }, "door-token")
  ]);
  const results = await Promise.all([body(first), body(second)]);
  assert.equal(results.filter(result => result.ok === true).length, 1);
  assert.equal(results.filter(result => result.alreadyUsed === true).length, 1);
  assert.equal(eventData.tickets.WXYZ2345.u, true);
});
