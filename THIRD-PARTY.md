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
  implemented. Search and room logic are application code.

## Gomoku by gkoos

- Repository: https://github.com/gkoos/gomoku
- Pinned commit: `fb28fc6374b357aee5d376b8a5a4f60fc54dd70d`
- File: `vendor/gomoku.js` (unmodified upstream `src/ai-worker.js`)
- The author declares the MIT License in the upstream README. The repository
  does not provide a separate LICENSE file; that declaration is preserved in
  `vendor/gomoku-README.md` with the original project description and credits.
- `gomoku-adapter.js` exposes the upstream bitboard win check, threats,
  candidates and alpha-beta search in a local Node VM context.
- `duel-ai.js` uses iterative search and a bounded worker runtime. The
  application uses freestyle Gomoku, including overlines as wins.

## Lucide

- Repository: https://github.com/lucide-icons/lucide
- Package version: `lucide@0.468.0`
- Files: `vendor/lucide.min.js`, `vendor/lucide-LICENSE.txt`.
- License: ISC. Used for the chess controls.

The board illustrations in `duel-art.svg` and `duel-board.js` are original
code-rendered artwork for this website. No external game UI was copied.
