# Org shell toolchain, one style for every repo and editor:
#   sh-fmt FILE...       shfmt, in place (2-space indent, indented case arms)
#   sh-fmt --stdin PATH  the same, stdin to stdout (editors; PATH names the file)
#   sh-lint FILE...      shellcheck
# Flags live here, so a repo needs no config of its own.
{
  shellcheck,
  shfmt,
  symlinkJoin,
  writeShellApplication,
}:

let
  shfmtArgs = "--indent 2 --case-indent";

  sh-fmt = writeShellApplication {
    name = "sh-fmt";
    runtimeInputs = [ shfmt ];
    text = ''
      if [[ ''${1-} == --stdin ]]; then
        exec shfmt ${shfmtArgs} --filename "$2"
      fi
      [[ ''${1-} == -- ]] && shift
      (($#)) || exit 0
      shfmt ${shfmtArgs} --write -- "$@"
    '';
  };

  sh-lint = writeShellApplication {
    name = "sh-lint";
    runtimeInputs = [ shellcheck ];
    text = ''
      [[ ''${1-} == -- ]] && shift
      (($#)) || exit 0
      shellcheck --external-sources -- "$@"
    '';
  };
in
symlinkJoin {
  name = "sh-tools";
  paths = [
    sh-fmt
    sh-lint
  ];
}
