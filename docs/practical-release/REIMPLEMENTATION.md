# LivingTown practical training release — reimplementation

Date: 2026-10-12. Status: local, unpublished training/preparation release. No deployment, push, merge, live-AI call, microphone permission, emergency call, shared database feed, payment or new credential was performed for this release.

## Lineage and preservation

- Public repository: https://github.com/hello-ai-company/livingtown
- Verified source baseline: Draft PR #14, `d37fb7aad518f6d687c8487bd3e318fafb5107d4`.
- The baseline includes the eight-member family reducer, fictional catalog, legacy map/route experience and existing tests.
- Later October 5–7 unpushed regional/obstacle/voice/cooperator changes were described in prior work, but their original complete source bytes were not recovered. This release **reimplements bounded training behavior from confirmed requirements**, rather than claiming recovery or byte-for-byte equivalence.
- The baseline source is preserved separately and was not overwritten. The release is an isolated clone. Existing historical screenshots and verification documents remain unchanged; they are **not evidence of this release**.
- The independently reviewed destination-evidence and preparation-workbook modules are integrated here with local imports. Their earlier standalone ZIP was not a complete application.

## Implemented scope

1. **Fictional regional practice.** Chiyoda-themed context, while clearly stating that names, roads and facilities do not correspond to actual ward evacuation data. Emergency-place and shelter purposes are separate. Fictional source creation dates stay fixed; actual observation, designation, opening and admission remain unknown.
2. **Eight obstacle types.** Construction, fallen tree, flood, overturned vending machine, hole, rescue-training marker, collapse and falling objects. Seven fixed training graph segments. Unverified posts change warnings, not eligibility or adopted routes. A separate explicit scripted verification can exclude a route. Rescue markers never dispatch people or verify a route. Observations expire after five minutes; removal of a block has the inherited 30-second reopening hold. Verification never refreshes the original observation or expiry.
3. **Emergency phrase practice without a microphone.** “Cannot move” immediately clears walking adoption, comparison and confirmations. Stop advances member revisions, including removed members, to reject queued confirmations. Reopening family practice requires all members' fresh confirmation and explicit resume; comparison/adoption must be performed again. A rest phrase becomes a condition only after explicit confirmation and exact member/revision/expiry matching. Unclear input is not interpreted as a condition.
4. **Independent legacy safety lock.** STOP and accepted session import synchronously end the independent legacy/native surface for the rest of this tab session: registry/phase signals are disposed, native gateway state is unbound, in-flight calls cannot restore approval state, and legacy controls cannot be reopened by family resume. This avoids reviving legacy routes that do not share the family model. It does not erase historical repository data.
5. **Anonymous cooperator simulation.** Local, scripted responses to an exact segment/request/profile-and-data revision with a 60-second expiry. Wrong, late, duplicate, replaced and canceled responses are rejected. No person, health details, precise live location, actual recipient or dispatch exists. Unknown or previously-clear answers never clear a route. Even a matching obstacle answer is only a simulated statement, not verification.
6. **Preparation workbook.** Nine discussion items, separate designation/opening concerns, revision-sensitive marks, explicit stopped status, unknown/stale readiness, local text export and print request. A checked box is discussion progress, not an actual safety check.
7. **Session transfer.** Explicit local UTF-8 JSON import/export, at most 64 KiB and 1–8 fictional members. Closed schema and enum allowlists reject unknown, duplicate, escaped duplicate and prototype keys. No arbitrary names, locations, health text, routes, confirmations or posts are exported. Preview and explicit confirmation precede an atomic replacement. The restored session is stopped and all derived confirmations/results are cleared. New file selection, cancel, unmount and intervening state changes invalidate asynchronous reads. No autosave is added.
8. **Usability.** A status summary, section navigation, large text controls, semantic labels, distinct stopped/unknown states, responsive panel layout and reduced-motion styles. Render-only tests check unique IDs and anchor targets.

## Safety and data boundaries

This is a fictional preparation tool. It does not certify safe evacuation, actual facility designation, current opening/admission/capacity, passability, available support or an individual's ability to travel. Unknown/skipped preferences do not mean support is unnecessary. All family members' required conditions must be met simultaneously; the app does not silently split the family or relax requirements.

The two Cabinet Office pages were re-opened and checked on 2026-10-12; the evacuation-place page points to January 2026 guidance, and the guideline page is the March 2026 revision. No live alert-level feed is implemented. Official reference links explain the institution and verification process; they do not endorse the fictional destinations:
- Cabinet Office, evacuation places: https://www.bousai.go.jp/taisaku/hinanbasyo.html
- Cabinet Office, evacuation-information guidelines: https://www.bousai.go.jp/oukyu/hinanjouhou/r3_hinanjouhou_guideline/

The practical family state is memory-only except for explicitly requested download/print output. The preserved independent legacy demo historically has its own local-storage behavior; that should not be confused with family-session autosave. Production builds retain the inherited fail-closed sample-only connection policy. No real data integrations were activated or tested here.

## Verification and unresolved gates

See [VERIFICATION.md](./VERIFICATION.md) for exact new commands/results. Historical 394-test or 19-browser-pass counts are not attributed to this rebuild.

- Unit, reducer, parser, SSR and mocked-native checks are automated evidence only.
- **Actual browser execution was not performed:** the available browser process was denied earlier and no alternative flags or route were used to bypass that restriction.
- Keyboard operation, mobile pixel layout, focus movement, file chooser/download, print dialog, 3D rendering, real native WebMCP behavior and actual assistive technologies therefore remain manual gates.
- Build warnings from inherited large optional 3D chunks are disclosed, not treated as failure or hidden.
- Real AI, shared DB, live disaster feeds, live identity, speech recognition/microphone, push notifications, emergency calls, field dispatch and deployment are out of scope and unverified.

## Local run

Use Node.js 22+ (Node.js 24 used for this release), with no live-service environment configuration:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

The default Vite port is 4173. Static build:

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

Portable archives intentionally omit `.git`. To run the backend packaging-policy test from an extracted archive, run `git init` locally first (no commit, remote, or push is needed); that inherited test calls `git check-ignore`. The app build and local demo do not require Git history.

Do not add live credentials merely to try the fictional training. To reset the family exercise during ordinary use, refresh the tab; unexported family input is lost. Saved files contain fictional choices only and should be handled deliberately. A reset does not establish actual-world safety.

## Preservation artifacts

Delivery includes a full tracked-source snapshot plus all new release files, a reversible baseline-relative patch, file SHA-256 manifest, verification logs and instructions. Dependency directories, environment secrets and `.git` internals are not included in portable source. Historical tracked assets/docs are preserved. The patch should be applied only to a clean exact-baseline checkout, and can be reverse-checked before use. Build output, if supplied separately, is not a deployment.
