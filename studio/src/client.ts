import { ccc, CellDepInfoLike, KnownScript, Script } from "@ckb-ccc/core";
import systemScripts from "../system-scripts.json";

export type Network = "devnet" | "testnet";

type ScriptInfo = Pick<Script, "codeHash" | "hashType"> & {
  cellDeps: CellDepInfoLike[];
};

const devnet = systemScripts.devnet;

/**
 * offckb writes the devnet's deployed system scripts to system-scripts.json.
 * The public testnet client already knows its own, so we only inject these.
 */
const DEVNET_SCRIPTS: Record<string, ScriptInfo> = {
  [KnownScript.Secp256k1Blake160]: devnet.secp256k1_blake160_sighash_all!
    .script as ScriptInfo,
  [KnownScript.Secp256k1Multisig]: devnet.secp256k1_blake160_multisig_all!
    .script as ScriptInfo,
  [KnownScript.AnyoneCanPay]: devnet.anyone_can_pay!.script as ScriptInfo,
  [KnownScript.OmniLock]: devnet.omnilock!.script as ScriptInfo,
  [KnownScript.XUdt]: devnet.xudt!.script as ScriptInfo,
  [KnownScript.NervosDao]: devnet.dao!.script as ScriptInfo,
};

export const DEVNET_RPC = "http://localhost:28114";

export function buildClient(network: Network) {
  return network === "testnet"
    ? new ccc.ClientPublicTestnet()
    : new ccc.ClientPublicTestnet({
        url: DEVNET_RPC,
        scripts: DEVNET_SCRIPTS as never,
      });
}

export function readEnvNetwork(): Network {
  // Set with:  $env:NETWORK='devnet'  (PowerShell)  /  NETWORK=devnet  (bash)
  const network = process.env.NETWORK;
  return network === "testnet" ? "testnet" : "devnet";
}
