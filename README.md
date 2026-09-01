# E2EE Messenger (Demo)

Ein minimaler Ende-zu-Ende-verschlüsselter Chat: Python/Flask als reiner
"blinder" Relay-Server, Verschlüsselung komplett im Browser via
Web Crypto API (AES-256-GCM, Schlüssel per PBKDF2 aus einem Passwort
abgeleitet).

## Starten

```bash
pip install flask
python server.py
```

Dann im Browser öffnen: http://localhost:5000
(Für einen Chat zwischen zwei "Personen" einfach einen zweiten Tab/
ein zweites Browserfenster öffnen und einen anderen Namen eingeben.)

## Wie die Verschlüsselung funktioniert

1. Beim Chat-Beitritt wird im Browser aus dem fest hinterlegten Passwort
   (`SHARED_PASSWORD` in `static/script.js`) über **PBKDF2** (250.000
   Iterationen, SHA-256) ein 256-Bit-AES-Schlüssel abgeleitet.
2. Beim Senden wird die Nachricht mit **AES-256-GCM** und einem
   zufälligen IV verschlüsselt. Nur `iv` und `ciphertext` (Base64)
   verlassen den Browser.
3. Der Server (`server.py`) speichert und liefert diese Blobs 1:1 weiter –
   er hat weder das Passwort noch die Möglichkeit, den Inhalt zu lesen.
4. Der empfangende Browser leitet aus demselben Passwort denselben
   Schlüssel ab und entschlüsselt die Nachricht lokal.

## Wichtige Einschränkungen (bitte lesen, bevor du das produktiv nutzt)

Das ist eine **Lern-/Demo-Anwendung**, kein produktionsreifer Messenger:

- **Ein einziges, im Code fest hinterlegtes Passwort für alle** ersetzt
  kein echtes Schlüsselmanagement. Jeder mit Zugriff auf `script.js`
  kennt automatisch das Passwort und kann alle Nachrichten lesen.
- **Kein Forward Secrecy**: Wird das Passwort einmal kompromittiert,
  können auch alle zuvor abgefangenen Nachrichten entschlüsselt werden.
- **Fester Salt** für alle Nutzer – für eine Mehrbenutzer-/Produktivumgebung
  sollte jeder Nutzer/jede Gruppe einen eigenen, zufälligen Salt haben.
- **Keine Authentifizierung/Identitätsprüfung** der Absender – jeder, der
  den Server erreicht, kann unter beliebigem Namen Nachrichten posten.
- Kein TLS in diesem einfachen `app.run()` – für echten Einsatz hinter
  HTTPS/Reverse-Proxy betreiben.

Für einen echten E2EE-Messenger würde man stattdessen z. B. asymmetrische
Schlüsselpaare pro Nutzer (wie bei Signal/PGP), signierte Prekeys und
einen Schlüsselaustausch (z. B. X3DH/Double Ratchet) verwenden.

## Dateien

- `server.py` – Flask-Server, verwaltet nur verschlüsselte Blobs
- `static/index.html` – Chat-Oberfläche
- `static/style.css` – Styling
- `static/script.js` – Verschlüsselung (Web Crypto API) + Polling-Logik
