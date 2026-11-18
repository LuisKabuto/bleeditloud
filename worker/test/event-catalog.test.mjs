import test from "node:test";
import assert from "node:assert/strict";
import { listEvents, upsertEvent, setEventStatus } from "../src/event-catalog.js";

test("registra y lista eventos por fecha", () => {
  let catalog = {};
  ({ catalog } = upsertEvent(catalog, {
    id: "valencia-rock-2027", name: "Valencia Rock", city: "Valencia", date: "2027-04-10"
  }));
  ({ catalog } = upsertEvent(catalog, {
    id: "caracas-live-2027", name: "Caracas Live", city: "Caracas", date: "2027-03-08"
  }));
  assert.deepEqual(listEvents(catalog).map(e => e.id), ["caracas-live-2027", "valencia-rock-2027"]);
});

test("actualiza estado sin tocar otros eventos", () => {
  let catalog = {};
  ({ catalog } = upsertEvent(catalog, {
    id: "barquisimeto-rock-2027", name: "Barquisimeto Rock", city: "Barquisimeto", date: "2027-05-01"
  }));
  const closed = setEventStatus(catalog, "barquisimeto-rock-2027", "closed");
  assert.equal(closed["barquisimeto-rock-2027"].status, "closed");
  assert.equal(catalog["barquisimeto-rock-2027"].status, "open");
});

test("rechaza cambios de estado inválidos", () => {
  assert.throws(() => setEventStatus({}, "missing-event", "open"));
});
