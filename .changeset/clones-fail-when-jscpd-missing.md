---
'@nodeve/checks': patch
---

clones: fail loudly when jscpd can't be resolved instead of silently skipping. jscpd is a hard dependency, so an unresolvable binary means the install is broken and the copy-paste gate is blind — surfacing that is safer than a silent skip that leaves a repo believing it's covered.
