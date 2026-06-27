import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

// Renumbered 017 → 019 during the 2.1.21 upstream merge: upstream took 017 for
// agent-message-policies and 018 for approvals-approver-user-id (it had already
// taken 016 for messaging-group-instance in the prior merge). `name` stays
// 'container-config-env' so the runner (dedup keyed on name) still sees it as
// already-applied — no re-run. `version` is only an ordering hint in the barrel.
export const migration019: Migration = {
  version: 19,
  name: 'container-config-env',
  up(db: Database.Database) {
    db.prepare('ALTER TABLE container_configs ADD COLUMN env TEXT').run();
  },
};
