-- Cutover: wire OPJ1 / Kimi / Qwen onto a SimpleX DM channel.
--
-- Usage:
--   CID=<oliver-contact-id-from-pairing>
--   sed "s/__CONTACT_ID__/$CID/g" scripts/migrate-to-simplex.sql \
--     | sqlite3 data/v2.db
--
-- Idempotent: re-running with the same CID is a no-op.

BEGIN TRANSACTION;

-- 1. SimpleX messaging group for Oliver's DM
INSERT OR IGNORE INTO messaging_groups
  (id, channel_type, platform_id, name, is_group, unknown_sender_policy, created_at)
VALUES
  ('mg-simplex-oliver-__CONTACT_ID__',
   'simplex',
   'simplex:__CONTACT_ID__',
   'OPJ1 SimpleX Oliver',
   0,
   'strict',
   datetime('now'));

-- 2. Wire OPJ1 (Claude Opus, default w/o prefix)
INSERT OR IGNORE INTO messaging_group_agents
  (id, messaging_group_id, agent_group_id, session_mode, priority, created_at,
   engage_mode, engage_pattern, sender_scope, ignored_message_policy)
VALUES
  ('mga-simplex-opj1-__CONTACT_ID__',
   'mg-simplex-oliver-__CONTACT_ID__',
   'ag-1777053973937-w5v230',
   'shared',
   0,
   datetime('now'),
   'pattern',
   '^(?!@?[Kk]imi\b|@?[Qq]wen\b)',
   NULL,
   NULL);

-- 3. Wire Kimi (Infomaniak Test) on prefix `kimi`
INSERT OR IGNORE INTO messaging_group_agents
  (id, messaging_group_id, agent_group_id, session_mode, priority, created_at,
   engage_mode, engage_pattern, sender_scope, ignored_message_policy)
VALUES
  ('mga-simplex-kimi-__CONTACT_ID__',
   'mg-simplex-oliver-__CONTACT_ID__',
   'ag-1778056114399-7be06d',
   'shared',
   0,
   datetime('now'),
   'pattern',
   '^@?[Kk]imi\b',
   NULL,
   NULL);

-- 4. Wire Qwen (Infomaniak Qwen) on prefix `qwen`
INSERT OR IGNORE INTO messaging_group_agents
  (id, messaging_group_id, agent_group_id, session_mode, priority, created_at,
   engage_mode, engage_pattern, sender_scope, ignored_message_policy)
VALUES
  ('mga-simplex-qwen-__CONTACT_ID__',
   'mg-simplex-oliver-__CONTACT_ID__',
   'ag-1778066408037-d98f3f',
   'shared',
   0,
   datetime('now'),
   'pattern',
   '^@?[Qq]wen\b',
   NULL,
   NULL);

-- 5. Register Oliver's SimpleX identity as owner + member of all three agent
--    groups. The adapter's allowlist alone is not enough — messaging_groups
--    has unknown_sender_policy='strict', so non-members get dropped. The
--    Telegram and Signal channels seeded this via their pairing flow; SimpleX
--    has no pairing interceptor, so we set it explicitly here.
INSERT OR IGNORE INTO users (id, kind, display_name, created_at)
VALUES ('simplex:__CONTACT_ID__', 'simplex', 'Oliver', datetime('now'));

INSERT OR IGNORE INTO user_roles (user_id, role, agent_group_id, granted_by, granted_at)
VALUES ('simplex:__CONTACT_ID__', 'owner', NULL, NULL, datetime('now'));

INSERT OR IGNORE INTO agent_group_members (user_id, agent_group_id, added_by, added_at)
VALUES
  ('simplex:__CONTACT_ID__', 'ag-1777053973937-w5v230', 'system', datetime('now')),
  ('simplex:__CONTACT_ID__', 'ag-1778056114399-7be06d', 'system', datetime('now')),
  ('simplex:__CONTACT_ID__', 'ag-1778066408037-d98f3f', 'system', datetime('now'));

-- 6. Agent-destinations for A2A `send_message` — each agent gets a
--    `simplex_dm` named target pointing at the new channel.
INSERT OR IGNORE INTO agent_destinations
  (agent_group_id, local_name, target_type, target_id, created_at)
VALUES
  ('ag-1777053973937-w5v230', 'simplex_dm', 'channel', 'mg-simplex-oliver-__CONTACT_ID__', datetime('now'));

INSERT OR IGNORE INTO agent_destinations
  (agent_group_id, local_name, target_type, target_id, created_at)
VALUES
  ('ag-1778056114399-7be06d', 'simplex_dm', 'channel', 'mg-simplex-oliver-__CONTACT_ID__', datetime('now'));

INSERT OR IGNORE INTO agent_destinations
  (agent_group_id, local_name, target_type, target_id, created_at)
VALUES
  ('ag-1778066408037-d98f3f', 'simplex_dm', 'channel', 'mg-simplex-oliver-__CONTACT_ID__', datetime('now'));

COMMIT;

-- Verification: should print 4 rows after a successful run.
SELECT 'mg' AS what, channel_type, platform_id FROM messaging_groups WHERE channel_type='simplex'
UNION ALL
SELECT 'wiring', agent_group_id, engage_pattern FROM messaging_group_agents
  WHERE messaging_group_id='mg-simplex-oliver-__CONTACT_ID__';
