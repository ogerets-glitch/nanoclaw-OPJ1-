// Channel self-registration barrel.
// Each import triggers the channel module's registerChannelAdapter() call.
//
// The `channels` branch keeps this file fully populated — it's the
// fully-loaded, runnable branch. Individual `/add-<channel>` skills pull
// single files from this branch onto a user's install, appending their
// own import lines to a leaner barrel on main.

// cli — default channel that ships with main (always on, no credentials).
import './cli.js';
// Telegram + Signal removed 2026-05-14 — OPJ1 cutover to SimpleX. Their
// source files remain on disk for reference but are no longer imported.
import './simplex.js';
