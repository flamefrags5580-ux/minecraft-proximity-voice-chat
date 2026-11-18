const CONFIG = window.VOICE_CHAT_CONFIG || {};
const API_BASE_URL = (CONFIG.apiBaseUrl || "").replace(/\/$/, "");

const form = document.querySelector("#connect-form");
const codeInput = document.querySelector("#link-code");
const connectButton = document.querySelector("#connect-button");
const connectMessage = document.querySelector("#connect-message");
const connectionBadge = document.querySelector("#connection-badge");
const connectionLabel = document.querySelector("#connection-label");
const connectionTitle = document.querySelector("#connection-title");
const micButton = document.querySelector("#mic-button");
const micTitle = document.querySelector("#mic-title");
const micDescription = document.querySelector("#mic-description");
const micMessage = document.querySelector("#mic-message");
const micIcon = document.querySelector("#mic-icon");

let connected = false;
let microphoneStream = null;
let muted = localStorage.getItem("vc-muted") !== "false";

function setConnection(isConnected, playerName) {
  connected = isConnected;
  connectionBadge.classList.toggle("is-off", !connected);
  connectionBadge.classList.toggle("is-on", connected);
  connectionLabel.textContent = connected ? "CONNECTED" : "OFFLINE";
  connectionTitle.textContent = connected ? `Connected${playerName ? ` as ${playerName}` : ""}` : "Not connected";
  document.querySelector("#connection-panel").classList.toggle("is-connected", connected);
  if (connected) connectMessage.textContent = "Account linked. You can now join voice chat when the relay is online.";
}

function setMuted(nextMuted) {
  muted = nextMuted;
  localStorage.setItem("vc-muted", String(muted));
  if (microphoneStream) {
    for (const track of microphoneStream.getAudioTracks()) track.enabled = !muted;
  }
  micButton.textContent = muted ? "Unmute" : "Mute";
  micButton.classList.toggle("button-muted", muted);
  micButton.classList.toggle("button-live", !muted);
  micButton.setAttribute("aria-pressed", String(!muted));
  micTitle.textContent = muted ? "Microphone muted" : "Microphone unmuted";
  micDescription.textContent = muted ? "Your microphone is off." : "Your microphone is enabled on this device.";
  micIcon.classList.toggle("mic-live", !muted);
  micMessage.textContent = muted ? "Allow microphone access when your browser asks." : "Microphone enabled locally. Live voice still needs the relay connection.";
}

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    connectMessage.textContent = "Enter the six-character code shown in Minecraft.";
    codeInput.focus();
    return;
  }
  if (!API_BASE_URL) {
    connectMessage.textContent = "Connection service is not configured yet. Set apiBaseUrl in config.js to your relay URL.";
    return;
  }

  connectButton.disabled = true;
  connectButton.textContent = "Connecting…";
  connectMessage.textContent = "Checking your link code…";
  try {
    const response = await fetch(`${API_BASE_URL}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "That code could not be verified.");
    setConnection(Boolean(data.connected), data.playerName);
    if (!data.connected) connectMessage.textContent = data.error || "The server did not confirm the connection.";
  } catch (error) {
    connectMessage.textContent = error.message || "Could not reach the voice server. Check your connection and try again.";
  } finally {
    connectButton.disabled = false;
    connectButton.innerHTML = 'Connect <span aria-hidden="true">→</span>';
  }
});

micButton.addEventListener("click", async () => {
  if (!muted) {
    setMuted(true);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    micMessage.textContent = "Microphone access requires a supported browser and a secure HTTPS connection.";
    return;
  }
  try {
    if (!microphoneStream || microphoneStream.getAudioTracks().every((track) => track.readyState === "ended")) {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    setMuted(false);
  } catch (error) {
    micMessage.textContent = error.name === "NotAllowedError"
      ? "Microphone permission was denied. Allow it in your browser settings to unmute."
      : "Could not access a microphone. Check that one is connected and try again.";
  }
});

window.addEventListener("beforeunload", () => {
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
});

setConnection(false);
setMuted(muted);
