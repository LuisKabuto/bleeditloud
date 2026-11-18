import { createEventRecord, normalizeEventId } from "./event-model.js";

export function listEvents(catalog = {}) {
  return Object.values(catalog)
    .filter(Boolean)
    .map(event => createEventRecord(event))
    .sort((a, b) => (a.date + a.city + a.name).localeCompare(b.date + b.city + b.name));
}

export function upsertEvent(catalog = {}, input = {}) {
  const event = createEventRecord(input);
  const next = { ...catalog, [event.id]: event };
  return { catalog: next, event };
}

export function setEventStatus(catalog = {}, eventId, status) {
  const id = normalizeEventId(eventId);
  if (!catalog[id]) throw new Error("El evento no existe.");
  if (status !== "open" && status !== "closed") throw new Error("Estado de evento inválido.");
  return { ...catalog, [id]: { ...catalog[id], status } };
}
