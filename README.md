# Fiber: a browser payment channel, opened and paid

My work for the CKB **Fiber** campaign: run a Fiber node inside the browser as WebAssembly,
connect it to a public Testnet peer, open a real payment channel, and send an off-chain
CKB payment.

> **Status: in progress.** Nothing below is claimed until it has a screenshot and,
> where the chain can confirm it, a transaction read back from Testnet.

Previous campaign in this repo: [the xUDT walkthrough](XUDT.md) and the
[xUDT Studio](studio/) dashboard built on top of it.

---

## What the campaign asks for

Two interactive tutorials, completed in order, **in the same browser profile** — the
second restores the identity created by the first.

| | Quest | Proof required |
|---|---|---|
| 1 | Connect a browser node | Node running · public key visible · 1 peer connected · `node_started` and `peer_connected` in Node events |
| 2 | Open a channel and pay | Channel `ChannelReady` · payment `Success` · receipt (amount, channel ID, payment hash, balance change) · success entry in Runtime events |

Plus a personal reflection answering at least three of the campaign's questions.

---

## Quest 1 — Connect a browser node

Start a Fiber WASM node in the browser, create a Testnet identity local to that browser,
and connect over WebSocket Secure to a public Fiber peer.

- [ ] Node started
- [ ] Node public key recorded
- [ ] Connected to public peer (1 peer)
- [ ] `node_started` and `peer_connected` events visible
- [ ] Screenshot: `fiber/screenshots/quest1-node-connected.png`

| | |
|---|---|
| Node public key | _pending_ |
| Peer connected | _pending_ |
| Browser / profile | _pending_ |

## Quest 2 — Open a channel and send a payment

Restore the same identity, derive its CKB Testnet address, fund it from the faucet, open
a public channel, wait for `ChannelReady`, then send a keysend payment.

- [ ] Identity restored in the same browser profile
- [ ] Testnet `ckt` address derived
- [ ] Address funded from the CKB Testnet Faucet
- [ ] Channel opened
- [ ] Channel reached `ChannelReady`
- [ ] Keysend payment sent and confirmed `Success`
- [ ] Screenshot: `fiber/screenshots/quest2-payment-success.png`

| | |
|---|---|
| Funding address (`ckt…`) | _pending_ |
| Faucet transaction | _pending_ |
| Channel ID | _pending_ |
| Channel funding transaction | _pending_ |
| Payment hash | _pending_ |
| Amount sent | _pending_ |
| Balance before → after | _pending_ |

### On-chain verification

The channel-funding transaction is a real Testnet transaction; the payment is not. Once
the channel is open I read the funding transaction back from a Testnet node rather than
trusting the UI — capacity locked, confirmation, and the explorer link go here.

_pending_

---

## Notes and problems hit

A running log, written as things happen rather than reconstructed afterwards.

_nothing yet_

---

## Reflection

<!-- Write this yourself, in your own voice. The campaign asks for at least three of:
     - something confusing, unexpected or interesting
     - a problem: what you expected, what actually happened, how you resolved it
     - which parts of Fiber interest you most
     - what you would build with a browser-based Fiber node
     - what you would improve about the tutorials

     Keep the specifics: what the screen said, how long the faucet took, what you tried
     that did not work. Delete this comment when you write it. -->

---

## Safety notes for this repo

- Testnet only. Every address here starts with `ckt`.
- No private keys, seed phrases or browser-storage contents are committed, quoted or
  shared — not in screenshots, not in this file.
