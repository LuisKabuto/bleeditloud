import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_EVENT_ID,
  LEGACY_CRYPTO_PREFIX,
  normalizeEventId,
  eventPath,
  createEventRecord,
  assertEventMatch
} from "../src/event-model.js";

test("preserva el evento y prefijo históricos", () => {
  const event = createEventRecord({ name: "Live Café Rock", city: "Caracas", date: "2026-12-12" });
  assert.equal(event.id, LEGACY_EVENT_ID);
  assert.equal(event.cryptoPrefix, LEGACY_CRYPTO_PREFIX);
});

test("acepta eventos independientes", () => {
  const event = createEventRecord({
    id: "maracay-rock-2027",
    name: "Maracay Rock",
    city: "Maracay",
    date: "2027-02-20",
    venue: "Plaza Mayor"
  });
  assert.deepEqual(eventPath(event.id), ["events", "maracay-rock-2027"]);
  assert.equal(event.cryptoPrefix, "BL26|");
});

test("rechaza identificadores y fechas inválidos", () => {
  assert.throws(() => normalizeEventId("Evento Caracas"));
  assert.throws(() => createEventRecord({ name: "X", city: "CCS", date: "20/02/2027" }));
});

test("impide usar un ticket de otro evento", () => {
  assert.equal(assertEventMatch("maracay-rock-2027", "maracay-rock-2027"), true);
  assert.equal(assertEventMatch("maracay-rock-2027", "live-cafe-rock-2026"), false);
});
