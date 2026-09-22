# Shared Game UI

- Every game must load `avatar-data.js` and `social-data.js` before `game-ui.js`, plus `game-ui.css`, and use the shared `BoardGameUI` avatar picker, renderer, presence indicators and avatar interactions.
- Human avatars default to the first grapheme of the player's name. Offer upload, user-triggered camera capture, one emoji, and reset-to-initial; never assign the old fixed illustrated human faces (`avatar-0` through `avatar-3`).
- Store the avatar preference locally as `boardclub-avatar`. Photos must be center-cropped and re-encoded to small JPEGs in the browser before transmission; never send original photos. Normalize all incoming avatar data with `avatar-data.js` on both client and server. Allowlisted illustrated symbols are for server-assigned bots only.
- Choose a bot's illustrated emoji or name initial once when adding its seat, and preserve it across actions and reconnects. Live profile updates only change the requesting connection's own seat, and broadcast through the existing room state.
- Presence dots belong at the bottom-left of avatars. Online is GREEN (`#24976b`); offline is GRAY (`#92999d`). Apply these colors consistently to every game and lobby.
- Use actual connection state, not turn ownership, folded status, or automatic play. Active bots and local solo players count as online. Do not apply grayscale filters to the presence indicator or its ancestors.
- Keep status labels bilingual: Online / Offline and Chinese. Apply the same behavior in lobbies and game tables.
- Finished-game prompts must identify the actual winner, such as `Laura 胜利 / Laura wins`, not only say `Game over` or substitute the current actor for the winner.
- Keep avatar badges and winner prompts readable on phones. Update browser tests and the GitHub release bundle when changing shared UI assets.

## Shared Avatar Interactions

- Every existing and future game must expose a stable public `socialId` per occupied seat, use `BoardGameUI.avatar`, and register `BoardGameUI.mountInteractions(view, send)`. Its view returns `{code, players, you, connected}` with `you` being the local player's public social ID. Feed incoming `reaction` events to `receive`, and call `sync` after room changes.
- Clicking another player's avatar opens the shared flowers, splash, heart, applause, cheers and good-luck picker. Clicking one's own avatar keeps the avatar editor. Include bots, game tables and room lobbies; preserve keyboard operation, bilingual labels and mobile bounds.
- Servers use `game-social.js` to assign public IDs and validate room membership, target, allowlisted emoji and sender cooldown. Derive the sender from the authenticated connection, never from request fields. Do not expose authentication tokens as avatar IDs.
- Broadcast reactions as transient room-only events, not game actions or chat history. They must not change the game revision, consume a turn, restart AI searches or replay on reconnect. Keep effects brief, bounded and pointer-transparent; support reduced motion.
- Chat bubbles must use content-sized width with a capped maximum width/height, never stretch across an entire player row.

## Catan Seats

- Host identity belongs to the authenticated person, never to position zero. Lobby positions are chosen before starting; moving to another human's position requires their consent. Bots and open positions can be selected directly.
- Do not reorder players during a game. At start, sort by the agreed positions and remap chat author indices before creating the engine state. The first position acts first, and the second setup round is reversed.
- Preserve chosen positions, avatars and person-bound permissions through reconnects. Connection-based host transfer remains separate from seat selection.

## Shared Room Management

- All multiplayer games must use `room-control.js` for host consent, automatic succession, vacancies and idle deadlines, and `BoardGameUI.mountRoomControl` for the compact shared management entry and warning dialog.
- Host transfer requires the recipient's approval; a non-host may request the role with the current host's approval. On disconnect, choose the next online human clockwise by agreed position, skipping bots and offline seats. Reconnecting must not reclaim the host role automatically.
- After starting, only the host may remove another occupied seat. Revoke the removed connection's room membership, retain an explicit vacant seat and all game assets, stop AI/jobs/auto-next timers, and reject gameplay while any vacancy remains. Chat, reactions and management may continue.
- Hosts may remove bots as well as humans. All removal UI, including lobby bot removal, requires two distinct confirmations naming the target, with cancellation at either step. Invalidate stale confirmations when host, room or target identity changes; never remove a replacement using an old confirmation.
- The host can fill a specific vacancy with a bot; a joining human fills the first vacancy. Existing members must never acquire a second seat. Keep indices and game assets stable and assign a fresh public social ID to each replacement. Resume only when all vacancies are filled.
- Removal is not a ban. The removed person may explicitly enter the room code to join again if a vacancy remains. Do not auto-rejoin after a removal event.
- Room-wide idle auto-play defaults to idleAuto=false. Only the current host can change the shared 120-second idle-auto checkbox; other players see its read-only state. The room policy survives host succession and applies to replacement players, without inheriting the old occupant's auto-play state. When enabled, only required connected human actors get deadlines and a warning in the final 20 seconds. A valid action or stay acknowledgement resets their deadline; chat/profile/reactions do not. Disabling the room policy clears all deadlines and stops timeout-triggered auto-play, but preserves manually chosen auto-play. Everyone retains personal Start auto and Stop auto commands. Vacancies suspend deadlines. Disconnecting or leaving must not silently enable auto-play or auto-fold a human; wait for their return or host-managed replacement. Preserve green online presence for connected auto-playing humans.
- Add adapter tests for every future game and update browser regressions and the complete GitHub release bundle whenever this shared behavior changes.
