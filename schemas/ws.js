// schemas/ws.js — zod schemas for inbound WebSocket message payloads. CommonJS.
// validateMessage(type, payload) returns { ok: true, data } or { ok: false, error }.
const { z } = require("zod");

// Valid vote values match VOTE_VALUES in lib/wsHandlers.js.
const VOTE_VALUES = ["0", "1", "2", "3", "5", "8", "13", "?"];

// Valid role values match ROLE_VALUES in lib/roles.js.
const ROLE_VALUES = ["Voter", "Observer", "Facilitator"];

const SCHEMAS = {
  // login: authenticated users supply name, role, room; anon users only supply name (role/room
  // are optional because anon users are assigned a role server-side and their room comes from
  // the WS token). We validate what CAN be provided — the handler enforces business rules.
  login: z.object({
    name: z.string().min(1).max(80),
    role: z.enum(ROLE_VALUES).optional(),
    room: z.string().min(1).max(200).optional(),
    rejoinKey: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  }),

  // vote: carry a single vote value from the allowed deck.
  vote: z.object({
    vote: z.enum(VOTE_VALUES),
  }),

  // revealVotes: no payload fields required (handler ignores payload entirely).
  revealVotes: z.object({}).passthrough(),

  // resetVotes: no payload fields required.
  resetVotes: z.object({}).passthrough(),

  // startNextRound: no payload fields required.
  startNextRound: z.object({}).passthrough(),

  // endSession: no payload fields required.
  endSession: z.object({}).passthrough(),

  // changeRole: target user (optional, defaults to self) + new role.
  changeRole: z.object({
    targetUserId: z.string().optional(),
    newRole: z.enum(ROLE_VALUES),
  }),

  // logout: no payload (handler only uses userId from the socket).
  logout: z.object({}).passthrough(),
};

/**
 * Validate a WS message payload against the registered schema for `type`.
 * @param {string} type - The message type string.
 * @param {unknown} payload - The payload from the parsed message.
 * @returns {{ ok: true, data: object } | { ok: false, error: Error }}
 */
function validateMessage(type, payload) {
  const schema = Object.hasOwn(SCHEMAS, type) ? SCHEMAS[type] : undefined;
  if (!schema) return { ok: false, error: new Error("unknown_message_type") };
  // Treat missing/null payload as an empty object for schema types that accept it.
  const r = schema.safeParse(payload ?? {});
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

module.exports = { validateMessage, SCHEMAS, VOTE_VALUES, ROLE_VALUES };
