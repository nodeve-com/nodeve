---
'@nodeve/checks': major
---

The prose job is `md-prose` (nodeve's flake `packages.md-tools`), which runs vale with this package's `.vale.ini` and styles baked in by store path, replacing the `vale --config=node_modules/...` job. Update the repo's `nodeve` flake input so its `md-tools` carries `md-prose`.
