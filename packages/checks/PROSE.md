# Prose gate (Vale)

The gate has two engines. The TS checks run through `nodeve-check` (see [README](README.md#checks)); markdown _wording_ runs through [Vale](https://vale.sh) against the org house rules this package ships in `styles/nodeve/`.

## The house rules

- **`Narration`** — prose addressing a prior version (`used to`, `no longer`, `RESOLVED`, `correction:`). Every reader reads a doc fresh — nobody saw the copy you correct, so the history is dead weight. State the current fact; git holds the history.
- **`Ephemeral`** — words framing the doc's moment as transient (`uncommitted`, `this session`). Docs persist past commit; these go stale on land.
- **`Hedging`** — deferred-decision hedges (`if wanted`) + vagueness hedges. Make the call or cut it.
- **`Filler`** — low-value phrases that survive `write-good`/`proselint`: `in order to`, `note that`, `make sure to` (instruction narration). Cut, meaning survives.
- **`SentenceLength`** — telegraphic cap.

Generic word-list work (weasels, wordy phrases, passive voice) stays with the community `write-good` and `proselint` packages; `styles/nodeve/` holds only the house-specific judgment.

## Consuming it — nothing to author

ALWAYS ON, no per-repo setup. Extending `lefthook.checks.yml` is the whole opt-in: its `vale` job runs `vale --config=node_modules/@nodeve/checks/.vale.ini`, this package's OWN config. The config vendors its styles beside it (`styles/nodeve` + committed `styles/write-good`, `styles/proselint`) — no `vale sync`, no consumer `.vale.ini`, no severity block to restate and drift. A repo can't extend the gate yet skip prose: the job carries no guard and fails the commit when `vale` leaves PATH.

You need only the `vale` binary — install it via the repo's toolchain (the Nix devShell ships it), NOT `node_modules`.

Every rule BLOCKS; there are no advisory warnings — a rule nobody obeys isn't worth flagging.

## Tuning

Bump `@nodeve/checks` to change a rule everywhere — severities live in this package's [`.vale.ini`](.vale.ini), one source for every repo. Add a house rule with the `vale-house-rule` skill or by copying a sibling in `styles/nodeve/`. Anchor every token (`\b…\b`) so real technical prose survives. Test a bad fixture AND a legit near-miss before shipping. Re-vendor third-party styles with `pnpm sync-styles` after a `Packages` bump. It runs `vale sync`, drops the upstream `README.md`s (their prose trips the gate), and re-applies the house `write-good.Passive` message — one idempotent step, nothing manual.

> **Note.** `vale sync` renames this package's `.vale.ini` to `0-checks.ini` in place. Run it in a throwaway checkout, or restore the name after — never let the rename land on the tracked source.
