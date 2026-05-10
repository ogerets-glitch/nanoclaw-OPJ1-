// Channel self-registration barrel.
// Each import triggers the channel module's registerChannelAdapter() call.
//
// The `channels` branch keeps this file fully populated — it's the
// fully-loaded, runnable branch. Individual `/add-<channel>` skills pull
// single files from this branch onto a user's install, appending their
// own import lines to a leaner barrel on main.

// cli — default channel that ships with main (always on, no credentials).
import './cli.js';
import './telegram.js';
import './signal.js';
