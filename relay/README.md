# Relay service

Node.js HTTP + WebSocket relay for Railway. It provides:

- `POST /positions` — accepts an addon snapshot authenticated with `Authorization: $ADDON_TOKEN`.
- `POST /api/connect` — exchanges a current six-character addon link code for a browser session token.
- `GET /health` — health check.
- `wss://<host>/signal` — authenticated WebRTC offer/answer/ICE signaling and in-range peer lists.

## Run locally

```sh
cd relay
npm install
ADDON_TOKEN='replace-with-a-long-random-secret' npm start
```

Set Railway's start command to `npm start` with the service root directory set to `relay`, and add `ADDON_TOKEN` as a Railway variable. The service binds to `0.0.0.0:$PORT`.

## Important limitations

This is a first-pass signaling relay, not a complete voice deployment. State and sessions are kept in memory, so a restart or multiple replicas invalidate sessions and current positions. The Bedrock addon must POST `{ "players": [...] }` to `/positions` every few seconds with `id`, `name`, `x`, `y`, `z`, `dim`, `range`, `group`, and `linkCode`. The browser must exchange `/api/connect`'s returned token for WebSocket auth, then implement the WebRTC peer-connection flow. WebRTC media may need a separate TURN service for players behind restrictive NATs. Never commit the production `ADDON_TOKEN`.
