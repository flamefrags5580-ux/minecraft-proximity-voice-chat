# Minecraft Proximity Voice Chat

A Bedrock server addon and companion web client for proximity voice chat.

## Web UI

The initial web client is in `website/`. It includes a disconnected/link-code screen and microphone mute/unmute controls. The microphone control requests browser permission and toggles the local audio track; it does not transmit voice by itself. Live voice, account linking, and persistent auto-connect require a deployed relay/WebRTC backend, which is not included yet.

To preview the page, serve the `website/` directory with any static web server. Microphone access requires HTTPS (or localhost). To configure the connection request, edit `website/config.js` and set `apiBaseUrl` to the public HTTPS relay URL. The client expects `POST /api/connect` with JSON `{ "code": "ABC123" }`, and a successful JSON response such as `{ "connected": true, "playerName": "Player" }`.

## Addon

The downloadable Bedrock addon package and relay server are not implemented yet. See the repository for updates.
