# NanoClaw Codex group: GPT-5.6 Sol

- goal: Configure the production agent group `OPJ1 Codex` to use `gpt-5.6-sol` with medium reasoning, and prove the effective model with a real run.
- decisions: Use the official Codex model slug `gpt-5.6-sol` without the provider prefix because NanoClaw passes this value directly to Codex. Upgrade Codex from 0.138.0 to the latest stable 0.139.0 in a separately tagged candidate image so other NanoClaw groups and the global `latest` tag remain untouched. Roll back immediately to GPT-5.5 and the prior image if validation fails.
- open_questions: None; Oliver approved the CLI-upgrade and candidate-image extension on 2026-07-14.
- constraints: Production change; preserve ChatGPT authentication and all other group settings; no credential output; no push; restart only the `OPJ1 Codex` group; update infrastructure status after success.

### T1: Record and validate current state
- depends_on: []
- location: /home/opj1claw/nanoclaw
- description: Capture the current group configuration, installed Codex version, supported-model cache, Git state, and rollback value.
- validation: `bin/ncl groups config get --id a9e70f1c-4c4d-4fc6-be2f-db7e28007e58`
- status: Completed
- next_action: Start T2.
- evidence: Plan-only commit `9756afa8`; current config reports provider=codex, model=null, effort=null; Codex cache reports client_version=0.138.0 and no GPT-5.6 entry; backup `data/v2.db.bak-20260714-gpt56sol` created.
- rollback: No runtime change in this task.
- files: .plan/gpt-5-6-sol-plan.md
- executor: codex
- reviewers: [codex-self-review]
- updated_at: 2026-07-14

### T2: Apply model configuration and restart group
- depends_on: [T1]
- location: /home/opj1claw/nanoclaw/data/v2.db
- description: Set model to `gpt-5.6-sol` and reasoning effort to `medium`, then restart only the target agent group.
- validation: `bin/ncl groups config get --id a9e70f1c-4c4d-4fc6-be2f-db7e28007e58`
- status: Completed
- next_action: Start T3.
- evidence: `ncl groups config update` and readback both report model=`gpt-5.6-sol`, effort=`medium`; target container was already stopped (`restarted: 0`), so no active workload was interrupted.
- rollback: Restore model and effort to their prior unset/default values and restart the target group.
- files: data/v2.db, groups/opj1-codex/container.json
- executor: codex
- updated_at: 2026-07-14

### T3: Smoke-test effective model
- depends_on: [T2, T2a]
- location: /home/opj1claw/nanoclaw/data/v2-sessions
- description: Trigger one real turn, verify successful completion and confirm the effective model in Codex turn context; roll back if rejected.
- validation: Inspect the new Codex session `turn_context` and NanoClaw service logs.
- status: Not Completed
- next_action: Wait for T2a completion, then repeat the GPT-5.6 Sol smoke test.
- evidence: Real turn context selected model=`gpt-5.6-sol`, effort=`medium`, but Codex returned HTTP 400: `The 'gpt-5.6-sol' model requires a newer version of Codex.` Rollback applied as explicit model=`gpt-5.5`, effort=`medium`; target container stopped and config readback verified.
- blocker: Installed Codex CLI 0.138.0 is too old for GPT-5.6 Sol. The confirmed scope did not authorize changing the pinned CLI version or rebuilding the production image.
- rollback: Completed: restored GPT-5.5/medium and restarted the target group (`restarted: 1`).
- files: data/v2-sessions, logs
- executor: codex
- updated_at: 2026-07-14

### T2a: Upgrade Codex CLI in isolated candidate image
- depends_on: [T2]
- location: /home/opj1claw/nanoclaw/container
- description: Pin `@openai/codex` 0.139.0, run manifest tests, build a uniquely tagged candidate image, and verify its Codex version without moving the global `latest` tag.
- validation: Run the CLI-tools test, build `nanoclaw-agent-v2-67315674:gpt56sol-codex0139`, then execute `codex --version` in that image.
- status: In Progress
- next_action: Update only `container/cli-tools.json`, test it, and build the candidate image.
- evidence: Current stable release is 0.139.0; current pin and live image contain 0.138.0. Build script accepts an explicit tag and container runner honors the group's exact `image_tag`.
- rollback: Keep the existing `nanoclaw-agent-v2-67315674:codex-6547acea` image and restore that group image tag if any validation fails.
- files: container/cli-tools.json, .plan/gpt-5-6-sol-plan.md
- executor: codex
- reviewers: [codex-self-review]
- updated_at: 2026-07-14

### T4: Document and close
- depends_on: [T3]
- location: /opt/shared/PROJECT_STATUS.md
- description: Record the successful production model change, complete verification, and archive this plan.
- validation: Review Git diff, ownership, permissions, service status, and log output.
- status: Not Completed
- next_action: Wait for T3 completion.
- evidence: Pending.
- rollback: Revert documentation commit and retain the active plan if production validation is incomplete.
- files: /opt/shared/PROJECT_STATUS.md, .plan/archive/gpt-5-6-sol-plan.md
- executor: codex
- updated_at: 2026-07-14
