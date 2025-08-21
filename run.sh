#!/usr/bin/env bash

nix develop --command bash -c "xvfb-run npm run start"
