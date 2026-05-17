/**
 * One-shot Delta-Chat bot-account bootstrap. Idempotent: re-running on a
 * configured account just prints the existing address + a fresh verification
 * QR code without re-registering at the chatmail provider.
 *
 * Mirrors Pi-Bridge `bot-bootstrap.py` line for line (intentional — the
 * setup is identical apart from being TypeScript instead of Python and
 * landing under /home/opj1claw/ instead of /home/opipi/).
 *
 * Run as the `opj1claw` user once after copying the rpc-server binary into
 * `~/.local/bin/`. Outputs the bot mail address and a `https://i.delta.chat/...`
 * QR URL to render with `qrencode` and scan from Olivers Delta-Chat app.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { StdioDeltaChat } from '@deltachat/jsonrpc-client';

const ACCOUNTS_DIR = process.env.DELTACHAT_ACCOUNTS_DIR ?? join(homedir(), '.deltachat-data', 'accounts');
const RPC_BIN = process.env.DELTACHAT_RPC_SERVER_PATH ?? join(homedir(), '.local', 'bin', 'deltachat-rpc-server');
const CHATMAIL_URL = process.env.DELTACHAT_CHATMAIL_URL ?? 'DCACCOUNT:https://nine.testrun.org/new';
const DISPLAY_NAME = process.env.DELTACHAT_DISPLAY_NAME ?? 'OPJ1-Bot';
const SELF_STATUS = process.env.DELTACHAT_SELF_STATUS ?? 'Olivers NanoClaw OPJ1 (privat)';

async function main(): Promise<void> {
  await mkdir(ACCOUNTS_DIR, { recursive: true });

  const proc = spawn(RPC_BIN, [], {
    env: { ...process.env, DC_ACCOUNTS_PATH: ACCOUNTS_DIR },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  proc.on('error', (err) => {
    console.error(`Failed to spawn rpc-server at ${RPC_BIN}:`, err);
    process.exit(1);
  });

  const dc = new StdioDeltaChat(proc.stdin, proc.stdout, /* startEventLoop */ true);

  const cleanup = async (code: number): Promise<never> => {
    try {
      dc.close();
    } catch {
      /* noop */
    }
    try {
      proc.kill('SIGTERM');
    } catch {
      /* noop */
    }
    await delay(200);
    process.exit(code);
  };

  try {
    const existing = await dc.rpc.getAllAccounts();
    let accountId: number;
    let alreadyConfigured = false;

    if (existing.length === 0) {
      console.log('No account yet — adding a fresh one...');
      accountId = await dc.rpc.addAccount();
      console.log(`  account_id = ${accountId}`);
    } else {
      const account = existing[0]!;
      accountId = account.id;
      if (account.kind === 'Configured') {
        alreadyConfigured = true;
        const addr = await dc.rpc.getConfig(accountId, 'addr');
        console.log(`Account ${accountId} already configured: ${addr ?? '(no addr)'}`);
      } else {
        console.log(`Account ${accountId} exists but is not yet configured — resuming setup.`);
      }
    }

    if (!alreadyConfigured) {
      await dc.rpc.setConfig(accountId, 'bot', '1');
      await dc.rpc.setConfig(accountId, 'displayname', DISPLAY_NAME);
      await dc.rpc.setConfig(accountId, 'selfstatus', SELF_STATUS);

      console.log(`Registering with chatmail provider: ${CHATMAIL_URL}`);
      await dc.rpc.setConfigFromQr(accountId, CHATMAIL_URL);

      console.log('Configuring (provider handshake, can take 30–60s)...');
      await dc.rpc.configure(accountId);

      const ok = await dc.rpc.isConfigured(accountId);
      if (!ok) {
        console.error('FAILED: configuration did not complete. Check rpc-server stderr above.');
        await cleanup(3);
      }
      const addr = await dc.rpc.getConfig(accountId, 'addr');
      console.log('\n=== SUCCESS ===');
      console.log(`Bot mail address: ${addr ?? '(no addr)'}`);
      console.log(`Bot account id  : ${accountId}`);
    }

    console.log('\nStarting IO so we can produce a verification QR...');
    await dc.rpc.startIo(accountId);

    const qrUrl = await dc.rpc.getChatSecurejoinQrCode(accountId, null);

    console.log('\n=== QR VERIFICATION URL ===');
    console.log(qrUrl);
    console.log('\nRender with: qrencode -o /tmp/dc-qr.png -s 10 -m 4 <<< "<URL>"');
    console.log('Then scan from your Delta-Chat app: Menu → Add Contact → Scan QR.');
    console.log('After SecureJoin, look up the new contact id (>1) and set');
    console.log(`  DELTACHAT_ALLOWED_CONTACT_IDS=<id>  in NanoClaw's .env, then restart the service.`);

    await dc.rpc.stopIo(accountId);
  } catch (err) {
    console.error('Bootstrap failed:', err);
    await cleanup(2);
  }

  console.log(`\nDone. Account data lives in ${ACCOUNTS_DIR}`);
  await cleanup(0);
}

void main();
