# grimoire holds every sensible default

A grimoire profile should carry **every value that has a sensible default** — `unit_id` (known per-unit, e.g. chint=1, foxess=247), the serial `device` path (`/dev/ttyUSB0`, the bog-standard first USB adapter), TCP `port`, line params. The dividing line for "does it live in grimoire" is _does a sensible default exist?_ All are overridable downstream. The **only** transport fact with no sensible default is the TCP `host` (which bridge IP fronts the device — a site fact), so it alone is supplied by the consuming gateway.

**Why:** don't evict or comment-out a known default just because a per-instance override exists — that strands the value in dead prose instead of one source of truth. Absence ≠ "no default exists."

**How to apply:** when deciding whether a field belongs in a grimoire definition, keep it if a reasonable default exists (mark it overridable); push it downstream only if there's genuinely no default. `unit_id` lives once on `device` (same addressing on either wire), not per-transport. Related: grimoire is consumer-agnostic (the [guard](../../../scripts/guard-grimoire-agnostic.sh) enforces it).
