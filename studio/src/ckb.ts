import { ccc } from "@ckb-ccc/core";

/**
 * Everything this app knows about xUDT lives here. The UI never talks to the
 * chain directly, so each function below is also usable from a node script
 * (see scripts/smoke-test.js).
 */

export type Client = ccc.Client;

/** A token identified by its xUDT args, and what one account holds of it. */
export type Holding = {
  args: ccc.Hex;
  amount: bigint;
  cells: number;
  capacity: bigint;
};

/** One live cell carrying a token. */
export type HolderCell = {
  amount: bigint;
  lockArgs: ccc.Hex;
  lockHash: ccc.Hex;
  capacity: bigint;
  outPoint: string;
};

export const FEE_RATE = 1000n; // shannons per 1000 bytes, not a flat fee

export function xudtTypeScript(client: Client, args: ccc.HexLike) {
  return ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, args);
}

/**
 * The tutorial's recap says to query by "the Lock Script Hash of the token
 * issuer". That alone never matches: xUDT args are the 32-byte lock hash plus
 * a 4-byte flags field. Rather than fail with "not found", we explain and fix.
 */
export function normalizeXudtArgs(input: string): {
  args?: ccc.Hex;
  note?: string;
  error?: string;
} {
  const raw = input.trim();
  if (!raw) return { error: "Enter the token's xUDT args." };
  if (!/^0x[0-9a-fA-F]*$/.test(raw))
    return { error: "Must be a hex string starting with 0x." };

  const body = raw.slice(2).toLowerCase();
  if (body.length === 72) return { args: `0x${body}` };
  if (body.length === 64)
    return {
      args: `0x${body}00000000`,
      note:
        "That was a 32-byte lock script hash. xUDT args are the lock hash plus " +
        "a 4-byte flags field, so 00000000 was appended for you.",
    };
  return {
    error: `Expected 36 bytes (74 chars incl. 0x), got ${
      body.length / 2
    } bytes. A truncated copy is the usual cause.`,
  };
}

/** Amounts are u128 integers in cell data — no decimals, ever. */
export function parseAmount(input: string): { amount?: bigint; error?: string } {
  const raw = input.trim();
  if (!raw) return { error: "Enter an amount." };
  if (!/^\d+$/.test(raw))
    return { error: "xUDT amounts are u128 integers — no decimals." };
  const amount = BigInt(raw);
  if (amount === 0n) return { error: "Amount must be greater than zero." };
  if (amount >= 1n << 128n) return { error: "Amount exceeds u128." };
  return { amount };
}

/**
 * A cell pays rent for its own bytes. The tutorial's UI hard-codes 61 CKB,
 * which is the floor for a bare cell; a token cell also carries the xUDT type
 * script and 16 bytes of amount. Measure it instead of guessing.
 */
export function tokenCellCapacity(lock: ccc.Script, type: ccc.Script): bigint {
  const output = ccc.CellOutput.from({ capacity: 0, lock, type });
  return ccc.fixedPointFrom(output.occupiedSize + 16);
}

export async function capacityOf(client: Client, lock: ccc.Script) {
  return client.getBalance([lock]);
}

/** Every xUDT this lock holds, grouped by token, in one indexer pass. */
export async function holdingsOf(
  client: Client,
  lock: ccc.Script,
): Promise<Holding[]> {
  const xudt = await client.getKnownScript(ccc.KnownScript.XUdt);
  const byToken = new Map<ccc.Hex, Holding>();

  const cells = client.findCells({
    script: lock,
    scriptType: "lock",
    scriptSearchMode: "exact",
    // args "0x" matches any xUDT token: the indexer treats filter args as a prefix
    filter: { script: { codeHash: xudt.codeHash, hashType: xudt.hashType, args: "0x" } },
    withData: true,
  });

  for await (const cell of cells) {
    const type = cell.cellOutput.type;
    if (!type || cell.outputData.length < 34) continue; // 0x + 16 bytes
    const args = type.args;
    const entry = byToken.get(args) ?? {
      args,
      amount: 0n,
      cells: 0,
      capacity: 0n,
    };
    entry.amount += ccc.numLeFromBytes(ccc.bytesFrom(cell.outputData).slice(0, 16));
    entry.cells += 1;
    entry.capacity += cell.cellOutput.capacity;
    byToken.set(args, entry);
  }

  return [...byToken.values()].sort((a, b) => (a.amount > b.amount ? -1 : 1));
}

/** Who holds a given token, cell by cell. */
export async function holdersOf(
  client: Client,
  args: ccc.HexLike,
): Promise<HolderCell[]> {
  const type = await xudtTypeScript(client, args);
  const out: HolderCell[] = [];
  for await (const cell of client.findCellsByType(type, true)) {
    out.push({
      amount: ccc.numLeFromBytes(ccc.bytesFrom(cell.outputData).slice(0, 16)),
      lockArgs: cell.cellOutput.lock.args,
      lockHash: cell.cellOutput.lock.hash(),
      capacity: cell.cellOutput.capacity,
      outPoint: `${cell.outPoint.txHash}:${cell.outPoint.index}`,
    });
  }
  return out.sort((a, b) => (a.amount > b.amount ? -1 : 1));
}

export type SentTx = { txHash: ccc.Hex; tokenArgs: ccc.Hex; outputs: number };

/**
 * Issue: mint a cell whose type script is xUDT and whose data is the amount.
 * The token's identity is the issuer's lock hash, so an account can only ever
 * issue one xUDT token this way — there is no separate deploy step.
 */
export async function issueToken(
  signer: ccc.SignerCkbPrivateKey,
  amount: bigint,
): Promise<SentTx> {
  const lock = (await signer.getAddressObjSecp256k1()).script;
  const tokenArgs = `${lock.hash()}00000000` as ccc.Hex;
  const type = await xudtTypeScript(signer.client, tokenArgs);

  const tx = ccc.Transaction.from({
    outputs: [{ lock, type }],
    outputsData: [ccc.numLeToBytes(amount, 16)],
  });
  await tx.addCellDepsOfKnownScripts(signer.client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, FEE_RATE);

  const txHash = await signer.sendTransaction(tx);
  return { txHash, tokenArgs, outputs: tx.outputs.length };
}

/**
 * Transfer: no balance is updated anywhere. Input cells are consumed and new
 * ones are created — one under the receiver's lock, one back to the sender for
 * the change. Replacing the lock script *is* the transfer.
 */
export async function transferToken(
  signer: ccc.SignerCkbPrivateKey,
  tokenArgs: ccc.HexLike,
  amount: bigint,
  receiverAddress: string,
): Promise<SentTx & { change: bigint }> {
  const client = signer.client;
  const senderLock = (await signer.getAddressObjSecp256k1()).script;
  const receiverLock = (await ccc.Address.fromString(receiverAddress, client))
    .script;
  const type = await xudtTypeScript(client, tokenArgs);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: receiverLock, type }],
    outputsData: [ccc.numLeToBytes(amount, 16)],
  });
  await tx.completeInputsByUdt(signer, type);

  const change =
    (await tx.getInputsUdtBalance(client, type)) - tx.getOutputsUdtBalance(type);
  if (change < 0n)
    throw new Error(
      `Not enough tokens: short by ${-change}. Check the Holdings tab.`,
    );
  if (change > 0n)
    tx.addOutput({ lock: senderLock, type }, ccc.numLeToBytes(change, 16));

  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, FEE_RATE);

  const txHash = await signer.sendTransaction(tx);
  return { txHash, tokenArgs: type.args, outputs: tx.outputs.length, change };
}

/** What the chain says about a transaction once it lands. */
export async function txSummary(client: Client, txHash: ccc.HexLike) {
  const res = await client.getTransaction(txHash);
  if (!res) return undefined;
  const tx = res.transaction;
  const fee =
    (await tx.getInputsCapacity(client)) - tx.getOutputsCapacity();
  return {
    status: res.status,
    blockNumber: res.blockNumber,
    inputs: tx.inputs.length,
    outputs: tx.outputs.length,
    fee,
  };
}

export const shortHex = (hex: string, head = 10, tail = 6) =>
  hex.length <= head + tail + 2 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`;

export const ckb = (shannons: bigint) => ccc.fixedPointToString(shannons);
