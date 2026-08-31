# LivingTown three-minute demo script

This script is for a public demo video. Keep the final video under three minutes, include audio, and show the working product in the first 15 seconds. Do not enter personal information into demo payloads.

## 0:00 — The problem

“Disaster apps are usually opened only after an emergency. The most useful local knowledge often lives in ordinary conversations: a crosswalk floods in heavy rain, or a path is too narrow for a wheelchair. LivingTown turns that living memory into a route that people and agents can verify together.”

## 0:20 — MAP: turn conversation into knowledge

1. Open the MAP phase and show the five current tools: `contribute_knowledge`, `delete_knowledge`, `query_area`, `update_knowledge`, and `verify_knowledge`. In Simple mode, explain that these appear as friendly actions rather than technical names. In Advanced mode, show the `Auto`, `Japan (GSI)`, and `Worldwide (OpenFreeMap)` basemap choices and move overseas to demonstrate the worldwide provider.
2. Tap **Report something**, tap the map, and complete the five-step flow: location → category → condition → confidence → description/review/privacy. Keep the description under 200 characters and confirm that it contains no personal information. Show the new `PENDING` visual and its detail card.
3. Verify it twice with the local demo fixtures. Show the transition to `VERIFIED`.
4. Point out that the verification threshold is agreements minus disagreements of at least two, and that duplicate pseudonymous votes are ignored. In Advanced mode, show that only the current user's memories expose edit/delete controls, and that vote-bearing edits require reverification confirmation.
5. Move to an overseas location such as San Francisco or London and show that worldwide Knowledge coordinates remain available. Switch JA/EN and show that the provider and camera are preserved. The current-location action is explicit and one-shot; routing households and the deterministic drill graph remain in the Tokyo demo area.

## 1:10 — DRILL: let verified knowledge change the route

1. Switch to the DRILL phase and select the wheelchair household.
2. Calculate a flood/rain route.
3. Show the route avoiding the verified crosswalk. Open the detail card and point to the exact avoided edge and the human-readable `avoided.reason`.
4. Explain that the household profile contains only a safe constraint enum and a scoped demo coordinate—not a name, diagnosis, or exact address.

## 1:55 — REPLAY: debrief together

1. Report a bottleneck and switch to REPLAY.
2. Use `control_replay` and show the `KNOWLEDGE → ROUTE` panel.
3. Show the influential knowledge, avoided reason, edge, and bottleneck derived from the same selected route snapshot.

## 2:30 — WebMCP lifecycle and close

1. Open WebMCP Diagnostics and switch MAP → DRILL → REPLAY.
2. Show the tool surface changing from 5 tools to 3 tools to 2 tools, with the previous phase's tools removed.
3. In a native WebMCP browser, show `getTools()`, `toolchange`, and the phase transition evidence. If the browser is not native, show `SIMULATED` honestly and do not call it real-device evidence.

“LivingTown does not make an agent memorize a UI. The tools available now are the tools exposed now, and the town's shared state explains the route.”
