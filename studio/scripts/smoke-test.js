#!/usr/bin/env node
/**
 * Runs the app's domain layer (src/ckb.ts) against a live devnet, with no
 * browser involved. Compiles the module with tsc first, so the UI and this
 * script exercise exactly the same code.
 *
 *   offckb node          # in another terminal
 *   npm run smoke
 */
const { execFileSync } = require("child_process");
const { join } = require("path");
const assert = require("assert");

const root = join(__dirname, "..");
const outDir = join(root, ".smoke");

console.log("compiling src/ckb.ts …");
// Call tsc through node rather than the npx shim: .cmd shims need a shell on Windows.
execFileSync(
  process.execPath,
  [join(root, "node_modules", "typescript", "bin", "tsc"),
   "src/ckb.ts", "--outDir", ".smoke", "--module", "commonjs",
   "--target", "es2020", "--moduleResolution", "node10", "--skipLibCheck"],
  { cwd: root, stdio: "inherit" },
);

const {
  normalizeXudtArgs, parseAmount, tokenCellCapacity,
  holdersOf, holdingsOf, xudtTypeScript,
} = require(join(outDir, "ckb.js"));
const { ccc } = require("@ckb-ccc/core");
const sys = require(join(root, "system-scripts.json")).devnet;

const K = ccc.KnownScript;
const client = new ccc.ClientPublicTestnet({
  url: "http://localhost:28114",
  scripts: {
    [K.Secp256k1Blake160]: sys.secp256k1_blake160_sighash_all.script,
    [K.Secp256k1Multisig]: sys.secp256k1_blake160_multisig_all.script,
    [K.AnyoneCanPay]: sys.anyone_can_pay.script,
    [K.OmniLock]: sys.omnilock.script,
    [K.XUdt]: sys.xudt.script,
    [K.NervosDao]: sys.dao.script,
  },
});

(async () => {
  // --- pure logic -----------------------------------------------------------
  const lockHash = "0x7de82d61a7eb2ec82b0dc653e558ba120efcbfbb44dac87c12972d05bf250653";

  const padded = normalizeXudtArgs(lockHash);
  assert.strictEqual(padded.args, `${lockHash}00000000`);
  assert.ok(padded.note, "a 32-byte lock hash should be explained, not rejected");

  assert.ok(normalizeXudtArgs("0x7de82d61").error, "short args must be rejected");
  assert.ok(normalizeXudtArgs("nonsense").error, "non-hex must be rejected");
  assert.strictEqual(normalizeXudtArgs(`${lockHash}00000000`).note, undefined);

  assert.ok(parseAmount("1.5").error, "decimals are not u128 amounts");
  assert.ok(parseAmount("0").error, "zero is not a useful amount");
  assert.strictEqual(parseAmount("42").amount, 42n);
  console.log("pure logic ok");

  // --- capacity maths against the real scripts ------------------------------
  const lock = await ccc.Script.fromKnownScript(
    client, K.Secp256k1Blake160, "0x8e42b1999f265a0078503c4acec4d5e134534297",
  );
  const type = await xudtTypeScript(client, `${lockHash}00000000`);
  const needed = tokenCellCapacity(lock, type);
  assert.strictEqual(
    ccc.fixedPointToString(needed), "146",
    "a secp256k1 + xUDT token cell occupies 146 CKB",
  );
  console.log(`token cell capacity: ${ccc.fixedPointToString(needed)} CKB (tutorial UI checks 61)`);

  // --- live chain -----------------------------------------------------------
  const holders = await holdersOf(client, `${lockHash}00000000`);
  const total = holders.reduce((a, c) => a + c.amount, 0n);
  console.log(`holders of the tutorial token: ${holders.length} cells, ${total} tokens`);
  for (const h of holders)
    console.log(`  ${h.amount} held by ${h.lockArgs} (${ccc.fixedPointToString(h.capacity)} CKB)`);

  const byLockHashOnly = await holdersOf(client, lockHash);
  assert.strictEqual(
    byLockHashOnly.length, 0,
    "querying by the bare lock hash finds nothing - this is the tutorial's bug",
  );
  console.log("querying by the bare lock script hash returns 0 cells, as expected");

  const held = await holdingsOf(client, lock);
  console.log(`account #0 holds ${held.length} distinct token(s):`);
  for (const h of held)
    console.log(`  ${h.args} -> ${h.amount} across ${h.cells} cell(s), ${ccc.fixedPointToString(h.capacity)} CKB locked`);

  console.log("\nall assertions passed");
})().catch((e) => {
  console.error("\nsmoke test failed:", e.message ?? e);
  process.exit(1);
});
