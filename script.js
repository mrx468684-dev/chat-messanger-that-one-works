/* =========================================================================
   E2EE Messenger – Client

   Alles, was mit Verschlüsselung zu tun hat, passiert HIER im Browser.
   Der Server bekommt niemals das Passwort oder den Klartext zu sehen –
   nur die Werte "iv" und "ciphertext", die unten erzeugt werden.
   ========================================================================= */

// Gemeinsames Passwort, aus dem der Schlüssel abgeleitet wird.
// In einer echten App würde man das interaktiv abfragen statt
// hart zu codieren – hier fest vorgegeben, wie gewünscht.
const SHARED_PASSWORD = "KEYCODE1233!\"§R";

// Fester Salt für die Schlüsselableitung. Das ist für eine Demo mit einem
// einzigen gemeinsamen Passwort okay; in einer produktiven App sollte
// jeder Nutzer/jede Gruppe einen eigenen, zufälligen Salt bekommen.
const KDF_SALT = "e2ee-messenger-demo-salt-v1";
const PBKDF2_ITERATIONS = 250000;

const POLL_INTERVAL_MS = 1500;

let cryptoKey = null;
let username = "";
let lastMessageIndex = 0;
let pollTimer = null;

/* ---------------------------- Crypto-Helfer ---------------------------- */

async function deriveKey(password, saltString) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(saltString),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function encryptText(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return {
    iv: bufToBase64(iv),
    ciphertext: bufToBase64(ciphertextBuf),
  };
}

async function decryptText(key, ivBase64, ciphertextBase64) {
  const iv = new Uint8Array(base64ToBuf(ivBase64));
  const ciphertextBuf = base64ToBuf(ciphertextBase64);
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertextBuf
  );
  return new TextDecoder().decode(plaintextBuf);
}

/* ------------------------------ UI-Logik -------------------------------- */

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const usernameInput = document.getElementById("username-input");
const joinBtn = document.getElementById("join-btn");
const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const statusDot = document.getElementById("status-dot");

joinBtn.addEventListener("click", enterChat);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enterChat();
});

async function enterChat() {
  const name = usernameInput.value.trim();
  if (!name) {
    usernameInput.focus();
    return;
  }
  username = name;

  // Schlüssel aus dem fest hinterlegten Passwort ableiten.
  cryptoKey = await deriveKey(SHARED_PASSWORD, KDF_SALT);

  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  messageInput.focus();

  startPolling();
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !cryptoKey) return;

  messageInput.value = "";

  const { iv, ciphertext } = await encryptText(cryptoKey, text);

  // Optimistisch direkt anzeigen, bevor die Serverantwort da ist.
  renderMessage({ sender: username, text }, true);

  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: username, iv, ciphertext }),
    });
    if (!res.ok) throw new Error("Server lehnte Nachricht ab");
    setOnline(true);
  } catch (err) {
    setOnline(false);
    console.error("Senden fehlgeschlagen:", err);
  }
});

function renderMessage({ sender, text, error }, isSelf) {
  const row = document.createElement("div");
  row.className = "bubble-row " + (isSelf ? "self" : "other");

  const meta = document.createElement("div");
  meta.className = "bubble-meta";
  meta.textContent = sender;

  const bubble = document.createElement("div");
  bubble.className = "bubble" + (error ? " decrypt-error" : "");
  bubble.textContent = error ? "⚠️ Nachricht konnte nicht entschlüsselt werden" : text;

  row.appendChild(meta);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setOnline(isOnline) {
  statusDot.classList.toggle("online", isOnline);
}

/* ------------------------------ Polling --------------------------------- */

function startPolling() {
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

async function pollOnce() {
  try {
    const res = await fetch(`/api/messages?since=${lastMessageIndex}`);
    if (!res.ok) throw new Error("Polling fehlgeschlagen");
    const data = await res.json();
    setOnline(true);

    for (const record of data.messages) {
      // Eigene, bereits optimistisch angezeigte Nachrichten nicht doppelt rendern.
      if (record.sender === username) continue;

      try {
        const plaintext = await decryptText(cryptoKey, record.iv, record.ciphertext);
        renderMessage({ sender: record.sender, text: plaintext }, false);
      } catch (decryptErr) {
        // Falsches/unterschiedliches Passwort -> Nachricht bleibt unlesbar.
        renderMessage({ sender: record.sender, error: true }, false);
      }
    }

    lastMessageIndex = data.next_index;
  } catch (err) {
    setOnline(false);
    console.error("Polling-Fehler:", err);
  }
}
