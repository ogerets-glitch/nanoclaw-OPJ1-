# Telegram Channel

**Intent:** Full Telegram bot implementation with multi-media support, model selection, voice I/O, and German UI. This is the primary (and only) channel for OPJ1.

## Files

- `src/channels/telegram.ts` — NEW (819 lines)
- `src/channels/telegram.test.ts` — NEW (990 lines)
- `src/channels/index.ts` — ONE LINE ADDED

## Dependencies

- `grammy` (^1.39.3) in package.json
- `sharp` (^0.34.5) in package.json (for image processing)
- `src/image.ts` (see section 3)
- External: Whisper STT at `http://127.0.0.1:8384`, Piper TTS at `http://127.0.0.1:8385`

## How to Apply

### 1. Register Telegram channel in barrel file

In `src/channels/index.ts`, add after the `// telegram` comment:

```typescript
import './telegram.js';
```

### 2. Copy telegram.ts and telegram.test.ts

Copy both files as-is from the main tree into `src/channels/`. These are entirely new files with no upstream equivalent (upstream removed Telegram code).

### 3. Key features in telegram.ts

The file implements `ChannelOpts` from `./registry.js` and self-registers via `registerChannel('telegram', factory)`.

**Model selection per-chat:**
- `/opus`, `/sonnet`, `/haiku` followed by message text — one-shot model override
- `/model <name>` — persistent per-chat preference (in-memory Map)
- `/think <msg>` — activates thinking with 10k token budget
- Model aliases stored in `MODEL_ALIASES` map

**Multimodal inbound:**
- Photos: downloaded via Grammy bot API → processed via `src/image.ts` (sharp, 1024px max, JPEG 80%) → base64 ImageAttachment
- Voice/Audio: downloaded → POST to `http://127.0.0.1:8384/transcribe` with FormData (field: `file`, language: `de`, timeout: 600s)
- Documents (PDF): downloaded via bot API → if PDF, save to `attachments/` dir → content read via `pdf-reader extract`
- Office docs (.docx, .xlsx, .pptx, .odt, .ods, .odp): converted via `libreoffice --headless --convert-to txt`
- Text files (.txt, .csv, .json, .xml, .md, .log): read directly
- Locations: extracted as `{ latitude, longitude }` on NewMessage **UND** zusätzlich als Fire-and-Forget-POST an den externen location-service weitergegeben (Ingest-Hook), damit OwnTracks-Tracking auch via Telegram-Standort-Push funktioniert. Siehe Commit `daebc66` — liest `LOCATION_SERVICE_URL` und `LOCATION_INGEST_KEY` aus `.env`, schickt `{ lat, lon, tst, chatId }` per HTTP POST. Fehler werden nur geloggt, nicht durchgereicht.
- Stickers: emoji placeholder
- Contacts: placeholder text

**Outbound voice (TTS):**
- `sendVoiceReply(chatId, text)` method on channel
- Cleans markdown (strips `**`, `*`, `#`, `` ` ``, `>`, `---`)
- POST to `http://127.0.0.1:8385/synthesize` with JSON `{ text }`, expects audio/ogg buffer
- Sends via `bot.api.sendVoice(chatId, InputFile(buffer, 'reply.ogg'))`

**Trigger translation:**
- `@bot_username` mentions automatically converted to trigger pattern `@Andy`
- Uses Grammy entity parsing to find mention entities

**Message splitting:**
- Messages > 4096 chars split at last newline before limit
- Tries Telegram MarkdownV1 parse mode first, falls back to plain text

**German UI strings:**
- Voice mode: "Voice-Modus aktiviert/deaktiviert"
- Model selection: "Modell gewechselt zu ..."
- Errors: German error messages

### 4. Test file (telegram.test.ts)

Complete unit test suite mocking Grammy's Bot class. Tests:
- Connection lifecycle (connect/disconnect)
- Text message handling (registered/unregistered chats, commands, sender names)
- @mention translation
- Non-text messages (photo, video, voice, audio, PDF, office docs, sticker, location, contact)
- sendMessage (splitting, markdown fallback, error handling)
- setTyping
- Bot commands (/chatid, /ping)

No external dependencies — all Grammy calls are mocked.
