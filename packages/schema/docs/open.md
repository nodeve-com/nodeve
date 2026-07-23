# Open

Known gaps and deliberate deferrals in the schema.

- **No metaclass.** Layer discipline (feature carries no slots-of-classes, node type carries no scalar slots) stays a lint, not a schema fact.
- **Backref FK columns take the parent's name** (`specification_node`); `content` grows one nullable backref per referencing class. A production cut wants explicit association classes.
- **Overlapping backref FKs.** `ac_ports` / `dc_ports` / `environments` all copy `subject_node.node` into one `feature_of_interest.subject_node_node`; SQLAlchemy warns every dump. Loads fine today, but wants explicit association classes before it turns load-bearing.
- **Upstream deprecates 61 kinds**, now flagged `replaced_by`. Nothing prefers the replacement yet — a binding may still cite a superseded kind, and only the flag says so.
- **No ref samples 9 registry `iri_template`s** (`brick`, `cim`, `saref4grid`, `seas`, `skos`, `sosa`, `ssn`, `ssn-system`, `vim`), so `check:refs` can't exercise them. The QUDT one 404'd undetected until caught.
- **Kind-level value domains: dropped.** grimoire's per-kind `schema:` block (`count` integer >= 1, `mass` > 0) fed the old JSON-Schema shape layer. `ValuedRange` owns bounds, and a kind-level floor checks only by joining Interval → ValuedRange → QuantityKind. If it matters, own a check — not columns.
- **Cross-row semantics fall outside LinkML.** `conditions`, interval bounds within envelope, offered-kinds-only — LinkML checks shape; these stay owned checks.
- **Seed discarded upstream codes.** grimoire registries carry their own `code` (`wikidata: JDV86GJS`); the ledger minted fresh ones from the permalink, so the same thing wears two handles until grimoire dies.
- **`code` is 40 bits.** No collisions at 1247 rows, but a birthday problem — ~1-in-2000 by 50k rows, near-certain by 1M. `bin/format.ts` skips the check; a collision would mint a duplicate silently.
