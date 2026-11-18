export const LEGACY_EVENT_ID = "live-cafe-rock-2026";
export const LEGACY_CRYPTO_PREFIX = "LCR26|";

const EVENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function normalizeEventId(value) {
  const id = String(value ?? "").trim().toLowerCase();
  if (!EVENT_ID_RE.test(id)) {
    throw new Error("Identificador de evento inválido.");
  }
  return id;
}

export function eventPath(eventId = LEGACY_EVENT_ID) {
  return ["events", normalizeEventId(eventId)];
}

export function createEventRecord(input = {}) {
  const id = normalizeEventId(input.id ?? LEGACY_EVENT_ID);
  const name = String(input.name ?? "").trim();
  const city = String(input.city ?? "").trim();
  const date = String(input.date ?? "").trim();
  if (name.length < 2 || city.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("El evento requiere nombre, ciudad y fecha válida.");
  }
  return {
    id,
    name,
    city,
    date,
    venue: String(input.venue ?? "").trim(),
    status: input.status === "closed" ? "closed" : "open",
    cryptoPrefix: id === LEGACY_EVENT_ID ? LEGACY_CRYPTO_PREFIX : String(input.cryptoPrefix ?? "BL26|"),
    createdAt: Number(input.createdAt ?? Date.now())
  };
}

export function assertEventMatch(eventId, ticketEventId) {
  return normalizeEventId(eventId) === normalizeEventId(ticketEventId);
}
