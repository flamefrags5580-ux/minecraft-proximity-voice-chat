const crypto = require("node:crypto");
const http = require("node:http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const ADDON_TOKEN = process.env.ADDON_TOKEN;
const MAX_PLAYERS = 200;
const CODE_TTL_MS = 30_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

if (!ADDON_TOKEN) {
  console.error("Missing required ADDON_TOKEN environment variable.");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

// In-memory state is suitable for a first deployment, but resets on restart/scale-out.
const players = new Map();
const sessions = new Map();
const sockets = new Map();

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function addonAuthorized(req, res, next) {
  const authorization = req.get("authorization") || "";
  if (!safeEqual(authorization, ADDON_TOKEN)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, dim: p.dim, range: p.range, group: p.group };
}

function validPlayer(p) {
  return p && typeof p.id === "string" && p.id.length <= 128 &&
    typeof p.name === "string" && p.name.length <= 64 &&
    [p.x, p.y, p.z].every(Number.isFinite) && typeof p.dim === "string" && p.dim.length <= 128;
}

function currentPeers(playerId) {
  const source = players.get(playerId);
  if (!source) return [];
  const now = Date.now();
  const result = [];
  for (const [id, other] of players) {
    if (id === playerId || now - other.seenAt > CODE_TTL_MS) continue;
    const sameGroup = source.group !== null && source.group === other.group;
    if (!sameGroup && source.dim !== other.dim) continue;
    const dx = source.x - other.x;
    const dy = source.y - other.y;
    const dz = source.z - other.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (sameGroup || distance <= Math.min(source.range, other.range)) {
      result.push({ ...publicPlayer(other), distance, volume: sameGroup ? 1 : Math.max(0, 1 - distance / Math.max(1, Math.min(source.range, other.range))) });
    }
  }
  return result;
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function notifyPeers() {
  for (const [id, ws] of sockets) send(ws, { type: "peers", peers: currentPeers(id) });
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "bedrock-proximity-vc-relay" }));

// Called by the Bedrock addon. The addon must send the secret in Authorization.
app.post("/positions", addonAuthorized, (req, res) => {
  const incoming = req.body?.players;
  if (!Array.isArray(incoming) || incoming.length > MAX_PLAYERS || !incoming.every(validPlayer)) {
    return res.status(400).json({ error: "Expected a valid players array." });
  }
  const now = Date.now();
  const present = new Set();
  for (const p of incoming) {
    present.add(p.id);
    players.set(p.id, {
      id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, dim: p.dim,
      range: Math.max(1, Math.min(Number(p.range) || 32, 128)),
      group: typeof p.group === "string" || Number.isInteger(p.group) ? p.group : null,
      linkCode: typeof p.linkCode === "string" ? p.linkCode.toUpperCase() : "",
      seenAt: now,
    });
  }
  for (const [id, p] of players) if (now - p.seenAt > CODE_TTL_MS) players.delete(id);
  notifyPeers();
  res.json({ ok: true, players: present.size });
});

// Exchange the one-time code displayed by the addon for a browser session token.
app.post("/api/connect", (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: "Enter a valid six-character code." });
  const now = Date.now();
  const player = [...players.values()].find((p) => p.linkCode === code && now - p.seenAt <= CODE_TTL_MS);
  if (!player) return res.status(404).json({ error: "Code not found or expired. Get a fresh code in Minecraft and try again." });
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { playerId: player.id, expiresAt: now + SESSION_TTL_MS });
  res.json({ connected: true, playerName: player.name, token });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/signal") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  let playerId = null;
  const authTimeout = setTimeout(() => ws.close(4401, "Authentication timeout"), 5000);
  ws.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return send(ws, { type: "error", error: "Invalid JSON." }); }

    if (!playerId) {
      if (message.type !== "auth" || typeof message.token !== "string") return ws.close(4401, "Authenticate first");
      const session = sessions.get(message.token);
      if (!session || session.expiresAt < Date.now()) return ws.close(4401, "Invalid or expired session");
      playerId = session.playerId;
      clearTimeout(authTimeout);
      const old = sockets.get(playerId);
      if (old && old !== ws) old.close(4001, "Replaced by a newer connection");
      sockets.set(playerId, ws);
      send(ws, { type: "ready", playerId, peers: currentPeers(playerId) });
      notifyPeers();
      return;
    }

    if (!["offer", "answer", "ice"].includes(message.type) || typeof message.to !== "string" || message.to.length > 128) {
      return send(ws, { type: "error", error: "Unsupported signaling message." });
    }
    const target = sockets.get(message.to);
    if (!target || target.readyState !== WebSocket.OPEN) return send(ws, { type: "peer-unavailable", peerId: message.to });
    if (!currentPeers(playerId).some((p) => p.id === message.to)) return send(ws, { type: "error", error: "That player is not in voice range or group." });
    send(target, { type: message.type, from: playerId, payload: message.payload });
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    if (playerId && sockets.get(playerId) === ws) {
      sockets.delete(playerId);
      notifyPeers();
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [id, p] of players) if (now - p.seenAt > CODE_TTL_MS) players.delete(id);
  notifyPeers();
}, 5000).unref();

server.listen(PORT, "0.0.0.0", () => console.log(`Relay listening on ${PORT}`));
