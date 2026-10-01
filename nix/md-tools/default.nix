# Org markdown toolchain, one config for every repo and editor:
#   md-fmt FILE...       rumdl's safe fixes, then dprint's layout, in place
#   md-fmt --stdin PATH  the same, stdin to stdout (editors; PATH names the file)
#   md-lint FILE...      rumdl check: structure and broken relative links
# Both bake the configs beside this file in by store path, so a repo needs no
# config of its own. Symlinked docs (CLAUDE.md -> README.md) are skipped; their
# target is handled through its own path.
{
  dprint,
  fetchurl,
  rumdl,
  symlinkJoin,
  writeShellApplication,
}:

let
  # nixpkgs ships 0.20, which predates the table.* and codeBlock.* options.
  markdownPlugin = fetchurl {
    url = "https://github.com/dprint/dprint-plugin-markdown/releases/download/0.24.0/plugin.wasm";
    hash = "sha256-z35lZ0t+tdkfhRUq6QINyLPnO9eUTvy/sF33EIEhd2Q=";
  };

  dprintFmt = "dprint fmt --config ${./dprint.json} --plugins ${markdownPlugin}";
  rumdlArgs = "--config ${./rumdl.toml} --no-cache";

  # Drop a leading `--` (older callers separate files with it) and symlinks.
  collectFiles = ''
    [[ ''${1-} == -- ]] && shift
    files=()
    for f in "$@"; do [[ -L $f ]] || files+=("$f"); done
    ((''${#files[@]})) || exit 0
  '';

  md-fmt = writeShellApplication {
    name = "md-fmt";
    runtimeInputs = [
      dprint
      rumdl
    ];
    text = ''
      if [[ ''${1-} == --stdin ]]; then
        # dprint resolves a path given to --stdin, which fails for an unsaved
        # buffer; the file name alone picks the plugin.
        rumdl fmt ${rumdlArgs} --quiet --stdin-filename "$2" - 2>/dev/null |
          ${dprintFmt} --stdin "$(basename "$2")"
        exit
      fi
      ${collectFiles}
      rumdl fmt ${rumdlArgs} --quiet -- "''${files[@]}" >/dev/null
      # dprint formats only files under its cwd; from / that is any absolute path.
      abs=()
      for f in "''${files[@]}"; do abs+=("$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"); done
      cd / && ${dprintFmt} -- "''${abs[@]}"
    '';
  };

  md-lint = writeShellApplication {
    name = "md-lint";
    runtimeInputs = [ rumdl ];
    text = ''
      ${collectFiles}
      rumdl check ${rumdlArgs} --quiet -- "''${files[@]}"
    '';
  };
in
symlinkJoin {
  name = "md-tools";
  paths = [
    md-fmt
    md-lint
  ];
}
