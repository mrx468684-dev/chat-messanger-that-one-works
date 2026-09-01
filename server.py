"""
E2EE-Messenger – Server

WICHTIG: Dieser Server sieht NIEMALS das Passwort und NIEMALS den Klartext
einer Nachricht. Er speichert und liefert ausschließlich verschlüsselte
Blobs (iv + ciphertext), die im Browser des Absenders mit AES-256-GCM
erzeugt wurden. Selbst bei vollem Zugriff auf diesen Server (Datenbank-Leak,
kompromittierter Admin usw.) könnte niemand die Nachrichten lesen, ohne
das gemeinsame Passwort zu kennen.
"""

from flask import Flask, jsonify, request, send_from_directory
from datetime import datetime, timezone
from threading import Lock
import os

app = Flask(__name__, static_folder="static", static_url_path="")

# Sehr einfacher In-Memory-Speicher für die Demo.
# Für einen echten Betrieb würde man das durch eine Datenbank ersetzen,
# an der Verschlüsselungslogik ändert sich dadurch nichts.
_lock = Lock()
message_history = []
MAX_HISTORY = 500


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/messages", methods=["GET"])
def get_messages():
    """
    Liefert alle verschlüsselten Nachrichten mit Index > 'since'.
    Der Client pollt diesen Endpunkt regelmäßig.
    """
    since = request.args.get("since", default=0, type=int)
    with _lock:
        new_messages = message_history[since:]
        next_index = len(message_history)
    return jsonify({"messages": new_messages, "next_index": next_index})


@app.route("/api/messages", methods=["POST"])
def post_message():
    """
    Nimmt eine bereits verschlüsselte Nachricht entgegen.
    Erwartetes JSON-Format:
        {
            "sender": "Alice",
            "iv": "<base64>",
            "ciphertext": "<base64>"
        }
    Der Server prüft nur, ob die Felder vorhanden sind – er kann und will
    den Inhalt nicht validieren, da er ihn nicht entschlüsseln kann.
    """
    data = request.get_json(silent=True)
    required_fields = {"sender", "iv", "ciphertext"}

    if not isinstance(data, dict) or not required_fields.issubset(data):
        return jsonify({"error": "Ungueltige Nachricht"}), 400

    record = {
        "sender": str(data["sender"])[:64],
        "iv": str(data["iv"]),
        "ciphertext": str(data["ciphertext"]),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    with _lock:
        message_history.append(record)
        if len(message_history) > MAX_HISTORY:
            message_history.pop(0)

    return jsonify({"status": "ok"}), 201


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
