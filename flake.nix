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
        # Org markdown and shell toolchains; nix-config installs them on dev machines.
        md-tools = pkgs.callPackage ./nix/md-tools { };
        sh-tools = pkgs.callPackage ./nix/sh-tools { };
      in {
        packages = { inherit md-tools sh-tools; };

        devShells.default = pkgs.mkShell {
          # Everything the commit gate shells out to. Node deps (jscpd, prettier,
          # ast-grep) come from node_modules and are NOT listed here — only the
          # tools that must exist on PATH.
          packages = with pkgs; [
            nodejs_26
            pnpm
            lefthook # runs the gate
            vale # nodeve-prose (ad-hoc prose runs)
            md-tools # md-fmt + md-lint + md-prose — the markdown jobs in both shared hook configs
            sh-tools # sh-fmt + sh-lint — the shell jobs in hooks/lefthook.yml
            uv # linkml runner: uvx --from linkml gen-json-schema / gen-typescript / python ddl.py
            postgresql_17 # check:db:pg — throwaway cluster proving the shipped postgres DDL. Pinned to the major the hosts run; bump when they move off 17
            jq
            yq-go # `yq` — reading/writing the LinkML + data YAML
          ];

          shellHook = ''
            echo "nodeve dev shell — node $(node --version), pnpm $(pnpm --version)"
          '';
        };
      });
}
