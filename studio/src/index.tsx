import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ccc } from "@ckb-ccc/core";
import { buildClient, DEVNET_RPC, readEnvNetwork } from "./client";
import { DEV_ACCOUNTS } from "./accounts";
import {
  capacityOf,
  ckb,
  Holding,
  HolderCell,
  holdersOf,
  holdingsOf,
  issueToken,
  normalizeXudtArgs,
  parseAmount,
  shortHex,
  tokenCellCapacity,
  transferToken,
  txSummary,
  xudtTypeScript,
} from "./ckb";

const network = readEnvNetwork();
const client = buildClient(network);
const KEY_STORE = "xudt-studio-key";

type Tab = "holdings" | "issue" | "transfer" | "explore";

type Banner = { kind: "ok" | "warn" | "err"; text: string; detail?: string };

function useSigner(privKey: string) {
  return useMemo(
    () =>
      /^0x[0-9a-fA-F]{64}$/.test(privKey)
        ? new ccc.SignerCkbPrivateKey(client, privKey)
        : undefined,
    [privKey],
  );
}

function App() {
  const [accountIndex, setAccountIndex] = useState(0);
  const [privKey, setPrivKey] = useState(
    () => sessionStorage.getItem(KEY_STORE) ?? "",
  );
  const [tab, setTab] = useState<Tab>("holdings");
  const [balance, setBalance] = useState<bigint>();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [tip, setTip] = useState<bigint>();
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>();
  const [exploreSeed, setExploreSeed] = useState("");

  const account = DEV_ACCOUNTS[accountIndex];
  const signer = useSigner(privKey);

  const lock = useMemo(
    () =>
      ccc.Script.from({
        codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
        hashType: "type",
        args: account.lockArgs as ccc.Hex,
      }),
    [account],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const addr = await ccc.Address.fromString(account.address, client);
      const [cap, held, height] = await Promise.all([
        capacityOf(client, addr.script),
        holdingsOf(client, addr.script),
        client.getTip(),
      ]);
      setBalance(cap);
      setHoldings(held);
      setTip(height);
    } catch (e) {
      setBanner({
        kind: "err",
        text: `Cannot reach the ${network} node at ${DEVNET_RPC}.`,
        detail: `Is \`offckb node\` running? (${String(e).slice(0, 160)})`,
      });
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The issuer's lock hash is the token id, so each account has exactly one.
  const ownTokenArgs = `${lock.hash()}00000000`;

  return (
    <main>
      <header>
        <div>
          <h1>
            xUDT Studio <span className={`net ${network}`}>{network}</span>
          </h1>
          <p className="sub">
            A wallet-shaped view of the CKB cell model: tokens are cells you own,
            not balances in a contract.
          </p>
        </div>
        <div className="tip">
          {tip !== undefined && <>block #{tip.toString()}</>}
          <button className="ghost" onClick={() => void refresh()} disabled={loading}>
            {loading ? "loading…" : "refresh"}
          </button>
        </div>
      </header>

      {banner && (
        <div className={`banner ${banner.kind}`} onClick={() => setBanner(undefined)}>
          <strong>{banner.text}</strong>
          {banner.detail && <span>{banner.detail}</span>}
        </div>
      )}

      <section className="account">
        <label>
          Account
          <select
            value={accountIndex}
            onChange={(e) => setAccountIndex(Number(e.target.value))}
          >
            {DEV_ACCOUNTS.map((a) => (
              <option key={a.index} value={a.index}>
                #{a.index} — {shortHex(a.address, 14, 8)}
              </option>
            ))}
          </select>
        </label>
        <dl>
          <div>
            <dt>Capacity</dt>
            <dd>{balance === undefined ? "…" : `${ckb(balance)} CKB`}</dd>
          </div>
          <div>
            <dt>Tokens held</dt>
            <dd>{holdings.length}</dd>
          </div>
          <div>
            <dt>Lock hash</dt>
            <dd title={lock.hash()}>{shortHex(lock.hash())}</dd>
          </div>
        </dl>
      </section>

      <nav className="tabs">
        {(["holdings", "issue", "transfer", "explore"] as Tab[]).map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "holdings" && (
        <Holdings
          holdings={holdings}
          onExplore={(args) => {
            setExploreSeed(args);
            setTab("explore");
          }}
        />
      )}
      {tab === "issue" && (
        <Issue
          signer={signer}
          lock={lock}
          balance={balance}
          ownTokenArgs={ownTokenArgs}
          onDone={refresh}
          setBanner={setBanner}
        />
      )}
      {tab === "transfer" && (
        <Transfer
          signer={signer}
          holdings={holdings}
          onDone={refresh}
          setBanner={setBanner}
        />
      )}
      {tab === "explore" && <Explore seed={exploreSeed} />}

      <section className="signing">
        <label>
          Private key <small>(needed only to sign; kept in sessionStorage, never written to disk)</small>
          <input
            type="password"
            placeholder="0x… 64 hex chars"
            value={privKey}
            onChange={(e) => {
              const v = e.target.value.trim();
              setPrivKey(v);
              sessionStorage.setItem(KEY_STORE, v);
            }}
          />
        </label>
        <p className={signer ? "ok" : "hint"}>
          {signer
            ? `signs as ${shortHex(privKey, 6, 4)} — devnet keys: offckb accounts --show-private-keys`
            : "Paste a devnet private key to enable issuing and transferring."}
        </p>
      </section>

      <footer>
        Built while following the{" "}
        <a href="https://docs.nervos.org/docs/dapp/create-token">
          Create a Fungible Token
        </a>{" "}
        tutorial · devnet RPC {DEVNET_RPC}
      </footer>
    </main>
  );
}

function Holdings({
  holdings,
  onExplore,
}: {
  holdings: Holding[];
  onExplore: (args: string) => void;
}) {
  if (holdings.length === 0)
    return (
      <section className="panel empty">
        <p>No xUDT cells under this lock yet. Issue some on the next tab.</p>
      </section>
    );

  return (
    <section className="panel">
      <table>
        <thead>
          <tr>
            <th>Token (xUDT args)</th>
            <th className="num">Amount</th>
            <th className="num">Cells</th>
            <th className="num">Locked capacity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.args}>
              <td className="mono" title={h.args}>
                {shortHex(h.args, 12, 10)}
              </td>
              <td className="num">{h.amount.toString()}</td>
              <td className="num">{h.cells}</td>
              <td className="num">{ckb(h.capacity)} CKB</td>
              <td>
                <button className="ghost" onClick={() => onExplore(h.args)}>
                  holders
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Amount is the sum of <code>{holdings.length}</code>{" "}
        {holdings.length === 1 ? "token" : "tokens"} across live cells — each cell
        stores its own 16-byte amount, and the capacity column is the CKB those
        cells must lock up as rent.
      </p>
    </section>
  );
}

function Issue({
  signer,
  lock,
  balance,
  ownTokenArgs,
  onDone,
  setBanner,
}: {
  signer?: ccc.SignerCkbPrivateKey;
  lock: ccc.Script;
  balance?: bigint;
  ownTokenArgs: string;
  onDone: () => void;
  setBanner: (b: Banner) => void;
}) {
  const [amount, setAmount] = useState("42");
  const [needed, setNeeded] = useState<bigint>();
  const [busy, setBusy] = useState(false);
  const parsed = parseAmount(amount);

  useEffect(() => {
    void (async () => {
      const type = await xudtTypeScript(client, ownTokenArgs);
      setNeeded(tokenCellCapacity(lock, type));
    })();
  }, [lock, ownTokenArgs]);

  const short = needed !== undefined && balance !== undefined && balance < needed;

  return (
    <section className="panel form">
      <h2>Issue</h2>
      <p className="note">
        The token's id is this account's lock hash, so an account issues exactly
        one xUDT token — no deploy step, no contract address.
      </p>
      <label>
        Amount
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {parsed.error && <p className="err">{parsed.error}</p>}
      <p className="note">
        Token id: <code className="mono">{ownTokenArgs}</code>
      </p>
      <p className={short ? "err" : "note"}>
        A token cell needs{" "}
        <strong>{needed === undefined ? "…" : `${ckb(needed)} CKB`}</strong> of
        capacity (lock + xUDT type script + 16 bytes of amount).{" "}
        {balance !== undefined && `This account holds ${ckb(balance)} CKB.`}
      </p>
      <button
        disabled={!signer || !parsed.amount || short || busy}
        onClick={async () => {
          if (!signer || !parsed.amount) return;
          setBusy(true);
          try {
            const res = await issueToken(signer, parsed.amount);
            const sum = await txSummary(client, res.txHash);
            setBanner({
              kind: "ok",
              text: `Issued ${amount} tokens in ${shortHex(res.txHash)}`,
              detail: sum
                ? `${sum.status}, ${sum.inputs} inputs → ${sum.outputs} outputs, fee ${sum.fee} shannons`
                : undefined,
            });
            onDone();
          } catch (e) {
            setBanner({ kind: "err", text: "Issue failed", detail: String(e).slice(0, 200) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "signing…" : "Issue tokens"}
      </button>
      {!signer && <p className="hint">Paste a private key below to enable this.</p>}
    </section>
  );
}

function Transfer({
  signer,
  holdings,
  onDone,
  setBanner,
}: {
  signer?: ccc.SignerCkbPrivateKey;
  holdings: Holding[];
  onDone: () => void;
  setBanner: (b: Banner) => void;
}) {
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState(DEV_ACCOUNTS[1]?.address ?? "");
  const [busy, setBusy] = useState(false);

  const selected = token || holdings[0]?.args || "";
  const parsed = parseAmount(amount);
  const held = holdings.find((h) => h.args === selected)?.amount ?? 0n;
  const tooMuch = parsed.amount !== undefined && parsed.amount > held;

  return (
    <section className="panel form">
      <h2>Transfer</h2>
      <p className="note">
        A transfer creates new cells: one under the receiver's lock script, one
        back to you for the change. Nothing updates a balance in place.
      </p>
      <label>
        Token
        <select value={selected} onChange={(e) => setToken(e.target.value)}>
          {holdings.length === 0 && <option value="">nothing held</option>}
          {holdings.map((h) => (
            <option key={h.args} value={h.args}>
              {shortHex(h.args, 12, 8)} — {h.amount.toString()} held
            </option>
          ))}
        </select>
      </label>
      <label>
        Amount
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10" />
      </label>
      {amount && parsed.error && <p className="err">{parsed.error}</p>}
      {tooMuch && <p className="err">Only {held.toString()} held.</p>}
      <label>
        Receiver
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {DEV_ACCOUNTS.map((a) => (
            <option key={a.index} value={a.address}>
              #{a.index} — {shortHex(a.address, 14, 8)}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!signer || !selected || !parsed.amount || tooMuch || busy}
        onClick={async () => {
          if (!signer || !parsed.amount) return;
          setBusy(true);
          try {
            const res = await transferToken(signer, selected, parsed.amount, to);
            const sum = await txSummary(client, res.txHash);
            setBanner({
              kind: "ok",
              text: `Sent ${amount} in ${shortHex(res.txHash)} — ${res.change} back as change`,
              detail: sum
                ? `${sum.status}, ${sum.inputs} inputs → ${sum.outputs} outputs, fee ${sum.fee} shannons`
                : undefined,
            });
            onDone();
          } catch (e) {
            setBanner({ kind: "err", text: "Transfer failed", detail: String(e).slice(0, 200) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "signing…" : "Transfer"}
      </button>
    </section>
  );
}

function Explore({ seed }: { seed: string }) {
  const [input, setInput] = useState(seed);
  const [cells, setCells] = useState<HolderCell[]>();
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Arriving from the Holdings tab: the token to inspect comes in as a prop.
  useEffect(() => {
    if (seed) {
      setInput(seed);
      void query(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function query(raw: string) {
    const { args, note: fixNote, error: argErr } = normalizeXudtArgs(raw);
    setNote(fixNote);
    setError(argErr);
    if (!args) return;
    setInput(args);
    setBusy(true);
    try {
      setCells(await holdersOf(client, args));
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  const total = cells?.reduce((a, c) => a + c.amount, 0n) ?? 0n;
  const holders = new Set(cells?.map((c) => c.lockArgs)).size;

  return (
    <section className="panel form">
      <h2>Explore a token</h2>
      <label>
        xUDT args
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x… 74 chars"
        />
      </label>
      {note && <p className="warn">{note}</p>}
      {error && <p className="err">{error}</p>}
      <button disabled={busy} onClick={() => void query(input)}>
        {busy ? "querying…" : "Find holders"}
      </button>

      {cells && (
        <>
          <p className="note">
            {cells.length} live {cells.length === 1 ? "cell" : "cells"} ·{" "}
            {total.toString()} tokens · {holders}{" "}
            {holders === 1 ? "holder" : "holders"}
          </p>
          <table>
            <thead>
              <tr>
                <th>Holder lock args</th>
                <th className="num">Amount</th>
                <th className="num">Capacity</th>
                <th>Out point</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((c) => {
                const known = DEV_ACCOUNTS.find((a) => a.lockArgs === c.lockArgs);
                return (
                  <tr key={c.outPoint}>
                    <td className="mono" title={c.lockArgs}>
                      {shortHex(c.lockArgs, 12, 6)}
                      {known && <span className="badge">account #{known.index}</span>}
                    </td>
                    <td className="num">{c.amount.toString()}</td>
                    <td className="num">{ckb(c.capacity)} CKB</td>
                    <td className="mono" title={c.outPoint}>
                      {shortHex(c.outPoint, 10, 4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
