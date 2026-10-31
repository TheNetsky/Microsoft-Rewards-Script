{
  description = "Microsoft Rewards Script with the project-pinned Patchright browser";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/master";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        commonPackages = with pkgs; [ nodejs_24 bash coreutils git cacert ];
        runtimeEnv = ''
          export PLAYWRIGHT_BROWSERS_PATH=0
          export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
        '';
        linuxEnvironment = {
          name = "rewards-runtime";
          multiArch = false;
          targetPkgs =
            p:
            commonPackages
            ++ (with p; [
              glibc
              stdenv.cc.cc.lib
              alsa-lib
              at-spi2-atk
              at-spi2-core
              atk
              cairo
              cups
              dbus
              expat
              fontconfig
              freetype
              glib
              gtk3
              libdrm
              libgbm
              libxkbcommon
              nspr
              nss
              pango
              udev
              zlib
              xorg.libX11
              xorg.libxcb
              xorg.libXcomposite
              xorg.libXdamage
              xorg.libXext
              xorg.libXfixes
              xorg.libXrandr
            ]);
          profile = runtimeEnv + ''
            export FONTCONFIG_FILE=${pkgs.makeFontsConf {
              fontDirectories = [ pkgs.dejavu_fonts pkgs.noto-fonts-color-emoji ];
            }}
          '';
        };
        launch = pkgs.writeShellScript "rewards-launch" ''
          exec bash ${./scripts/nix/launch.sh} "$@"
        '';
        runtime =
          if pkgs.stdenv.isLinux then
            pkgs.buildFHSEnv (linuxEnvironment // { runScript = launch; })
          else
            pkgs.writeShellApplication {
              name = "rewards-runtime";
              runtimeInputs = commonPackages;
              text = runtimeEnv + ''
                exec bash ${./scripts/nix/launch.sh} "$@"
              '';
            };
      in
      {
        packages.default = runtime;
        apps.default = {
          type = "app";
          program = "${runtime}/bin/rewards-runtime";
        };
        devShells.default =
          if pkgs.stdenv.isLinux then
            (pkgs.buildFHSEnv (linuxEnvironment // { runScript = "bash"; })).env
          else
            pkgs.mkShell {
              packages = commonPackages;
              shellHook = runtimeEnv;
            };
      }
    );
}
