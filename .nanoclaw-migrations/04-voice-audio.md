# Voice & Audio

**Intent:** Voice message transcription (Whisper STT) and text-to-speech replies (Piper TTS). Both use local services, no cloud APIs.

## External Services Required

- **Whisper STT:** `http://127.0.0.1:8384/transcribe` — accepts multipart/form-data with `file` field, returns JSON `{ text }`. Language: `de`. Timeout: 600s (for long voice messages).
- **Piper TTS:** `http://127.0.0.1:8385/synthesize` — accepts JSON `{ text }`, returns audio/ogg buffer.

These are separate services on the VPS, not part of NanoClaw.

## Implementation

Voice handling is entirely within `src/channels/telegram.ts` (section 2) and `src/index.ts`:

### Inbound (STT) — in telegram.ts

When a voice or audio message arrives:
1. Download via Grammy `bot.api.getFile()` + fetch
2. POST to Whisper endpoint as FormData
3. Replace message content with transcribed text, prefixed with `[Voice: ...]`
4. On failure: store placeholder `[Voice message — transcription failed]`

### Outbound (TTS) — in telegram.ts + index.ts

**Voice mode state:** File-based toggle at `data/.voice_mode`
- "voice on" → create file
- "voice off" → delete file
- "voice" → report status

**In index.ts** (after agent sends response):
```typescript
const voiceModeFile = path.join(process.cwd(), 'data', '.voice_mode');
if (fs.existsSync(voiceModeFile)) {
  const chatIdMatch = chatJid.match(/^tg:(\d+)$/);
  if (chatIdMatch && 'sendVoiceReply' in channel) {
    (channel as any).sendVoiceReply(chatIdMatch[1], text).catch(...);
  }
}
```

**In telegram.ts** (`sendVoiceReply` method):
1. Strip markdown formatting from text
2. POST to Piper TTS endpoint
3. Send audio buffer as Telegram voice message

## How to Apply

No separate files needed — voice is part of telegram.ts and index.ts. Follow the instructions in sections 2 (Telegram) and the index.ts integration (see section 5 container / section 6 session commands for index.ts changes).
