import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { StdioDeltaChat } from '@deltachat/jsonrpc-client';

const ACCOUNTS_DIR = join(homedir(), '.deltachat-data', 'accounts');
const RPC_BIN = join(homedir(), '.local', 'bin', 'deltachat-rpc-server');
const MAX_WAIT_SEC = 900;
const POLL_INTERVAL_SEC = 5;

async function main(): Promise<void> {
  const proc = spawn(RPC_BIN, [], {
    env: { ...process.env, DC_ACCOUNTS_PATH: ACCOUNTS_DIR, RUST_LOG: 'warn' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const dc = new StdioDeltaChat(proc.stdin, proc.stdout, true);
  const accs = await dc.rpc.getAllAccounts();
  const cfg = accs.find((a) => a.kind === 'Configured');
  if (!cfg) { console.error('No account'); process.exit(2); }
  const accountId = cfg.id;
  await dc.rpc.startIo(accountId);
  console.log(`watcher up, account_id=${accountId}, polling every ${POLL_INTERVAL_SEC}s for up to ${MAX_WAIT_SEC}s`);
  const deadline = Date.now() + MAX_WAIT_SEC * 1000;
  let lastReport = 0;
  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_SEC * 1000);
    const ids = await dc.rpc.getContactIds(accountId, 0, null);
    const fresh = ids.filter((id) => id > 1);
    if (fresh.length > 0) {
      for (const cid of fresh) {
        const contact = await dc.rpc.getContact(accountId, cid);
        console.log(`FRESH_CONTACT id=${cid} verified=${contact.isVerified} addr=${contact.address ?? '?'} name=${JSON.stringify(contact.displayName)}`);
      }
      break;
    }
    const fmsg = await dc.rpc.getFreshMsgs(accountId);
    if (fmsg.length > 0) console.log(`fresh msgs: ${fmsg.length}`);
    const now = Date.now();
    if (now - lastReport > 30000) {
      const remain = Math.floor((deadline - now) / 1000);
      console.log(`  heartbeat: ${remain}s left, contacts=${ids.length}`);
      lastReport = now;
    }
  }
  await dc.rpc.stopIo(accountId);
  try { dc.close(); } catch { /* noop */ }
  proc.kill('SIGTERM');
  await delay(300);
  process.exit(0);
}
void main().catch((e) => { console.error('watcher crashed:', e); process.exit(1); });
