import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

// Renumbered 016 → 017 during the 2.1.17 upstream merge: upstream took 016 for
// messaging-group-instance. `name` stays 'container-config-env' so the runner
// (dedup keyed on name) still sees it as already-applied — no re-run.
export const migration017: Migration = {
  version: 17,
  name: 'container-config-env',
  up(db: Database.Database) {
    db.prepare('ALTER TABLE container_configs ADD COLUMN env TEXT').run();
  },
};
