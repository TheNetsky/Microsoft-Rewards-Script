{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/master";
    flake-utils = {
      url = "github:numtide/flake-utils";
    };
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShell = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            nodejs
            playwright-driver.browsers
            typescript
            playwright-test

          # 与在 config.json 中设置 headless 相比，
          # 此方式可修复“等待加载完成”的问题
            xvfb-run
          ];

          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            npm i
            npm run build
          '';
        };
      }
    );
}
