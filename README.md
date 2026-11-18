# Minecraft Proximity Voice Chat

A Bedrock server addon and companion web client for proximity voice chat.

## Website

The web client is in `website/`. It currently includes disconnected/link-code UI and local microphone mute/unmute controls. Microphone access requires HTTPS (or localhost). The UI is not yet a complete live voice client: it must connect to the relay and create WebRTC peer connections to transmit audio.

## Relay

A first-pass Railway-compatible HTTP/WebSocket signaling service is in `relay/`. See [`relay/README.md`](relay/README.md) for setup. It supports addon position snapshots, link-code validation, in-range peer discovery, and forwarding WebRTC offer/answer/ICE messages. It keeps state in memory and needs a persistent/shared store before using multiple replicas.

## Bedrock addon

The addon package is not yet implemented. It must send player snapshots to the relay with a server-only `ADDON_TOKEN` and support `/voicechat connect <code>` to provide codes that the relay can verify. The `.mcpack` download will be added after the addon and configuration are complete.
