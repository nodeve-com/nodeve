# Prose gate (Vale)

The gate has two engines. The TS checks run through `nodeve-check` (see [README](README.md#checks)); markdown _wording_ runs through [Vale](https://vale.sh) against the org house rules this package ships in `styles/nodeve/`.

## The house rules

- **`Narration`** — prose addressing a prior version ("used to", "no longer", "RESOLVED", "correction:"). A doc is read fresh — the reader never saw the copy you're correcting, so the history is dead weight. State the current fact; git holds the history.
- **`Ephemeral`** — words framing the doc's moment as transient ("uncommitted", "this session"). Docs persist past commit; these go stale on land.
- **`Hedging`** — deferred-decision hedges ("if wanted") + vagueness hedges. Make the call or cut it.
- **`SentenceLength`** — telegraphic cap (advisory).

Generic word-list work (weasels, wordy phrases, passive voice) stays with the community `write-good` and `proselint` packages; `styles/nodeve/` holds only the house-specific judgment.

## Consuming it

Vale is a separate binary — install it via the repo's own toolchain (e.g. a Nix devShell), not `node_modules`. The rules ship as a **Vale package**: a consumer lists `node_modules/@nodeve/checks` in its `Packages`, and `vale sync` copies `styles/nodeve/` into its `StylesPath`. Vale doesn't inherit a package's severity block into the consumer's run, so a repo restates `BasedOnStyles` + severities — copy the canonical block from this package's [`.vale.ini`](.vale.ini):

```ini
# .vale.ini (consumer repo root)
StylesPath = styles
Packages   = write-good, proselint, node_modules/@nodeve/checks
[*.md]
BasedOnStyles = nodeve, write-good, proselint
nodeve.Narration = error
# … the rest of the block from @nodeve/checks/.vale.ini
```

Then `vale sync` once per clone — wire it into the repo's `prepare` script alongside `lefthook install`. The `vale` pre-commit job is already in `lefthook.checks.yml`, guarded to skip cleanly where `vale` isn't installed or no `.vale.ini` exists.

> **Note.** Syncing a local-directory package, Vale renames that package's `.vale.ini` to `0-checks.ini` in place — so after a sync you'll see `node_modules/@nodeve/checks/0-checks.ini`. It's cosmetic and confined to disposable `node_modules` (a fresh install restores `.vale.ini`, and the styles copy the same either way). Never point `Packages` at this package's own git working tree, or it renames the tracked source.

## Tuning

Bump `@nodeve/checks` to change a rule everywhere. A repo tunes severity in its own `.vale.ini`: `= error` blocks the commit, `= warning`/`= suggestion` are advisory, `= NO` silences. Add a house rule with the `vale-house-rule` skill or by copying a sibling in `styles/nodeve/` — anchor every token (`\b…\b`) so legitimate technical prose survives, and test both a bad fixture and a legit near-miss before shipping.
