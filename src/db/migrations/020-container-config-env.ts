import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

// Renumbered 017 → 019 → 020 across upstream merges: upstream took 017 for
// agent-message-policies, 018 for approvals-approver-user-id, and (in this
// merge) 019 for wiring-threads-override. `name` stays 'container-config-env'
// so the runner (dedup keyed on name) still sees it as already-applied — no
// re-run. `version` is only an ordering hint in the barrel.
export const migration020: Migration = {
  version: 20,
  name: 'container-config-env',
  up(db: Database.Database) {
    db.prepare('ALTER TABLE container_configs ADD COLUMN env TEXT').run();
  },
};
