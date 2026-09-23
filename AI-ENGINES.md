# Chess AI Runtime

The interface and game rules are unchanged. `duel-bot.js` replaces the default
JavaScript search with two locally bundled native engines:

| Game | Engine | Model | Protocol |
| --- | --- | --- | --- |
| 15x15 freestyle Gomoku | Rapfi 0.43.01 (250615) | Official mix9svq freestyle | Gomocup/Piskvork |
| Chinese chess | Pikafish 2026-09-06 | Official pikafish.nnue | UCI |

## Deployment

Upload the complete GitHub bundle, including `.gitattributes`, `engine-setup.js`
and every file under `vendor/engines`. Keep the directories intact.

```sh
npm install
npm start
```

The postinstall step verifies SHA-256 checksums, reassembles the three model
parts and sets Linux executable permissions. It does not download anything.
The upstream Linux Pikafish binary requires glibc 2.38. Render's Debian 12
runtime has older glibc, so setup automatically builds the SAME pinned source
with its installed `g++`, `make` and `tar`, one compiler job at a time. The
model is copied locally before compiling, so the upstream net target does not
download a replacement. This adds build time on the first deployment.
The generated binary and a source/recipe/output hash record stay local and are
ignored by Git. Source code is unchanged; build flags use portable SSE4.1 and
POPCNT, not build-machine-specific AVX instructions.
The generated `pikafish.nnue` is ignored by Git; keep all three source parts.
`.gitattributes` prevents line-ending conversion from invalidating hashes.
Running `node server.js` directly prepares weights lazily, but Linux hosts
requiring a compatible build must run `npm install` or `node engine-setup.js`
before starting the server. A live room never triggers a lengthy compilation.

Bundled platforms: Windows x64 and Linux x64. Rapfi requires SSE4.1. The
Pikafish universal executable selects CPU instructions at runtime. Other
platforms retain the emergency JavaScript AI, with a server warning.

For a deployment check, run:

```sh
node engine-setup.js
npm run test:ai
```

Both native engines must pass, without `skipped` tests, on a supported host.
The test suite uses `requireNative` so a fallback cannot conceal a bad install.
Setup also requires a successful real search from both engines before exiting.
Windows native execution is tested locally. This Windows workspace does not
have a Linux runtime; the Linux compilation/search checks run during deployment.

## Search And Cancellation

- Easy: 200 ms, Standard: 1000 ms, Advanced: 3000 ms per move, plus startup.
  These are time limits, not fixed Elo levels; Advanced uses the full engine.
- One search process at a time per Node server, one engine thread and a
  16 MiB hash table. Neural model and process memory are additional. Queued
  rooms wait their turn without blocking WebSocket messages or other games.
- Native assets are server-only and cannot be fetched through the game's
  static-file endpoint. Browsers never load the neural networks.
- Xiangqi sends the complete starting-position move history, not just the
  latest FEN, so search can account for repetition. Custom positions use FEN.
- Inputs are copied and every result is checked against the legal-move list.
  Before applying it, the server checks game identity, revision, job identity
  and room pause state again.
- Undo, vacancy, resignation, last-human disconnect and server shutdown cancel
  the job and terminate the child. A queue slot is released only after the
  child closes. Chat, reactions and profile changes leave searches intact.
- Startup failure, unsupported CPU/platform or search timeout logs a warning
  and uses the old bounded Worker AI. This is a recovery path, not the intended
  playing strength. Check deployment logs if the opponent seems weak.

The existing Xiangqi rules library remains the arbiter. It handles perpetual
check and threefold repetition, but not every tournament chasing adjudication.
Installing a stronger search engine does not change those room rules.

Render runtime/toolchain reference: https://render.com/docs/native-runtimes

## Verification

`duel-bot-test.js` runs actual binaries: forced wins and blocks for both Gomoku
colors, double-four creation, edge play, overlines, Xiangqi captures and winning
finishes, history, undo, cancellation, fallback and model integrity.
`duel-test.js` covers live rooms, queued cancellation, bot replacement and stale
results. `duel-ui-test.js` checks native replies and existing desktop/mobile UI.

```sh
npm run benchmark:ai
```

This runs four short matches against the previous AI with colors reversed.
The native engine uses Easy (200 ms), and the old AI uses Standard. It writes
all moves, search diagnostics and results to `test-results/duel-ai-benchmark.json`.
It is a regression check against the prior version, not a human rating or a
statistically meaningful Elo estimate.

Local Windows result (2026-09-23): Rapfi won both Gomoku games in 15 and 12
plies; Pikafish won both Xiangqi games by checkmate in 35 and 66 plies. The
native engines used 200 ms search budgets against the old Standard AI. This
four-game sample confirms a practical improvement over the previous version,
not a guarantee against every opponent or hardware configuration.

## Licenses

See `THIRD-PARTY.md` and the upstream licenses, authors and matching source
archives under `vendor/engines`. Both engine programs are GPLv3. Rapfi weights
are CC0. The Pikafish model separately prohibits commercial use without
permission; the owner confirmed private, ad-free, non-commercial use.
Obtain permission or replace that model before monetizing this deployment.
