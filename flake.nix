{
  description = "nodeve — public npm packages dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          # Everything the commit gate shells out to. Node deps (jscpd, prettier,
          # ast-grep) come from node_modules and are NOT listed here — only the
          # tools that must exist on PATH.
          packages = with pkgs; [
            nodejs_26
            pnpm
            lefthook # runs the gate
            vale # prose gate — @nodeve/checks runs it UNGUARDED: absent = commit fails
            uv # linkml runner: uvx --from linkml gen-json-schema / gen-typescript / python ddl.py
            postgresql # check:db:pg — throwaway cluster proving the shipped postgres DDL
            jq
            yq-go # `yq` — reading/writing the LinkML + data YAML
          ];

          shellHook = ''
            echo "nodeve dev shell — node $(node --version), pnpm $(pnpm --version)"
          '';
        };
      });
}
