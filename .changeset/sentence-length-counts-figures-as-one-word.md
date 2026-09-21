---
'@nodeve/checks': patch
---

`SentenceLength` counts a figure as one word. Its token was `\b(\w+)\b`, which reads `$14,903.16` as three words and `sensors.yaml` as two, so a sentence carrying money, versions or filenames tripped the 30-word cap while reading short. Prose about a mortgage or a release hit it constantly. The only escape was rewording until no sentence held a number — the rule bending the prose, not the prose bending to the rule.

The token now joins runs across `.` and `,`, then takes a trailing possessive. `05-15` and `device-group` still count as two, so ordinary hyphenated prose stays honest. Across the nodeve corpus the change clears three false positives and adds none.
