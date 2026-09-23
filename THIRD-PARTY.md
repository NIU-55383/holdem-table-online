# Bundled Chess Components

These files are included locally so the game does not depend on a browser CDN.

## Xiangqi.js

- Repository: https://github.com/lengyanyu258/xiangqi.js
- Pinned commit: `f9019ac2303d4b80ef0b82fd0515bfb55a80a62b`
- File: `vendor/xiangqi.cjs` (unmodified upstream `xiangqi.js`, renamed for CommonJS)
- License: BSD-2-Clause; full notice in `vendor/xiangqi-LICENSE.txt`.
- Used for legal moves, FEN, move/undo, check, material and repetition detection.
- The application adjudicates stalemate as a loss, and unilateral perpetual
  check as a loss on repetition. Complex tournament chase adjudication is not
  implemented. Native search is provided by Pikafish; room logic remains application code.

## Gomoku by gkoos

- Repository: https://github.com/gkoos/gomoku
- Pinned commit: `fb28fc6374b357aee5d376b8a5a4f60fc54dd70d`
- File: `vendor/gomoku.js` (unmodified upstream `src/ai-worker.js`)
- The author declares the MIT License in the upstream README. The repository
  does not provide a separate LICENSE file; that declaration is preserved in
  `vendor/gomoku-README.md` with the original project description and credits.
- `gomoku-adapter.js` exposes the upstream bitboard win check, threats,
  candidates and alpha-beta search in a local Node VM context.
- `duel-ai.js` is the emergency fallback, with iterative search and a bounded worker runtime. The
  application uses freestyle Gomoku, including overlines as wins.

## Rapfi

- Repository: https://github.com/dhbloo/rapfi
- Official release: https://github.com/dhbloo/rapfi/releases/tag/250615
- Version: 0.43.01; commit `1be1551ced57e38d53ed58f6d74bf6f8b4bdc230`.
- Unmodified Windows x64 SSE4.1 and Linux x64 SSE4.1 executables in `vendor/engines/rapfi`.
- GPL-3.0; full license and AUTHORS included. The matching source archive is
  `vendor/engines/rapfi/source.tar.gz`, including upstream build instructions.
- Official `mix9svqfreestyle_bsmix.bin.lz4` and `model210901.bin` weights use CC0:
  https://github.com/dhbloo/rapfi-networks ; full notice in `NETWORK-LICENSE.txt`.
- Only the runtime configuration is changed: UCI-like diagnostics, 16 MiB
  transposition table and freestyle-only neural weight selection. Binary code
  and models are unmodified. Freestyle rule 0 is selected per search.

## Pikafish

- Repository: https://github.com/official-pikafish/Pikafish
- Official release: https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06
- Commit `4c17cee11f888ae1d48a9494f2e2239f019f0a1f`.
- Unmodified universal Windows x64 and Linux x64 executables in `vendor/engines/pikafish`.
- On Linux systems with older glibc, setup compiles the included, unchanged
  source locally using GCC, `ARCH=x86-64-sse41-popcnt`, `make -j1 build`.
  `engine-setup.js` is the full build recipe; generated binaries
  are not redistributed in the upload bundle.
- Program license: GPL-3.0. Full Copying.txt, AUTHORS, upstream README and the
  matching `source.tar.gz` archive are included.
- The official neural weights have a SEPARATE license: `NNUE-License.md`.
  It prohibits commercial use without permission. This deployment is for
  the owner's confirmed non-commercial, ad-free use with friends. The model
  must not be described as an unrestricted GPL or CC0 asset.
- The model is split into three upload-sized parts; `engine-setup.js` joins
  them byte-for-byte. The original and reconstructed SHA-256 is
  `7d13d73569a9b571ba0eb20cf1596247bc2a42738967e61afef6482b231e900e`.
- Executables, configuration and models have pinned SHA-256 checksums in
  `vendor/engines/manifest.json`. Engines communicate with the application
  using their standard text protocols in separate processes.

## Lucide

- Repository: https://github.com/lucide-icons/lucide
- Package version: `lucide@0.468.0`
- Files: `vendor/lucide.min.js`, `vendor/lucide-LICENSE.txt`.
- License: ISC. Used for the chess controls.

The board illustrations in `duel-art.svg` and `duel-board.js` are original
code-rendered artwork for this website. No external game UI was copied.
