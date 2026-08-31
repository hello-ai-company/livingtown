# Living Observation Layer

Phase 10 extends LivingTown's existing Knowledge domain into a living
community-observation layer. It keeps the existing verification, ownership,
Realtime, route, WebMCP, MapLibre, and Navara architecture instead of adding a
second observation database.

## Product flow

The MAP screen keeps a visible one-line composer:

- JA: この場所で何がありましたか？
- EN: What's happening here?

The user writes one sentence and presses Enter or Send. The local
RuleBasedObservationInterpreter deterministically extracts a category, report
type, condition, confidence, and incident observation time. Ambiguous text
becomes other; no external LLM or paid AI API is required. Advanced mode shows
the derived fields and the existing five-step form remains available for
correction and owner edits.

The location shown by the composer is explicit and visible. Priority is:

1. a location selected on the map;
2. the last location explicitly obtained with the current-location action; and
3. the current map center.

The app never requests geolocation permission automatically. The current
location action is one-shot, does not track, and does not persist the raw
browser location.

## Observation contract

KnowledgeCategory retains all existing values and adds:

flood, fire, explosion, road_block, darkness, narrow_path, barrier, safe_spot,
theft, harassment, violence, conflict, infrastructure, accessibility,
crowding, and other.

Each row can carry:

- report_type: persistent_condition or incident;
- observed_at: optional for persistent conditions and required by policy for
  incidents, defaulting to now when omitted;
- expires_at: a current-map visibility deadline for incidents;
- source_kind: community or future official;
- location_precision_m: the applied public-coordinate precision.

Incident windows are policy data, not UI guesses: road blocks 12 hours, fire,
explosion, and conflict 24 hours, crowding 6 hours, theft and harassment 30
days, and violence 7 days. Expiry hides an incident from the current layer; it
does not claim that the historical report never existed.

## Trust and language

The existing net threshold remains agree_count - disagree_count >= 2.
Simple UI labels are intentionally different from official status:

- below the threshold: 地域からの報告 / Community report;
- at or above the threshold: 地域確認 2件以上 / 2 community confirmations.

No browser or WebMCP caller can set source_kind=official. A community vote
never promotes a row to official information. Raw owner and verifier IDs are
not part of the public Knowledge shape, and every community status carries a
公的確認ではありません / Not official confirmation disclaimer.

The presentation layer replaces sensitive free text with cautious,
non-accusatory wording for theft, harassment, violence, and conflict. It never
shows labels such as “molester here” or “criminal here,” and it does not state
that an alleged event is a proven fact. The trusted write boundary also stores
only a category-level public summary for those categories; a suspicious phrase
such as “someone groped me” takes the same safe-summary path even when a caller
labels it other.

## Privacy and safety

The UI and repository boundary block obvious email, phone, URL/handle,
address-shaped, vehicle-identifier, and person-name patterns with localized
messages. A basic email/URL/phone check is repeated in the SQL write RPC; this
is a minimum defense, not a claim of complete moderation.

Sensitive categories are coarsened before persistence, not copied into a
private exact-coordinate table:

| Category | Stored precision |
|---|---:|
| theft, harassment | 150m |
| violence | 200m |
| explosion | 500m |
| conflict | 2km |

General hazards such as flooding, barriers, and accessibility conditions keep
their selected map point. Conflict text that combines tactical terms with
precise-location terms is rejected with the localized tactical-safety message.
Generic explosion reports are allowed, but the map uses a neutral community
marker and never simulates weapons, troops, targeting, or blasts. Text that is
potentially sensitive but does not match a sensitive category receives a
conservative 2km fallback precision. Existing sensitive rows are normalized and
coarsened before the migration installs the public privacy check.

## Route policy

routeImpactPolicy.ts is a pure closed policy returning none, safety, or
blocking. It is derived from category and verification; callers cannot set it.
Unverified reports have no route effect. Theft, harassment, conflict,
safe-place, and other reports are map-only. Verified flood, fire, road block,
barrier, and explosion reports are blocking candidates; darkness, narrow paths,
violence, accessibility, crowding, and infrastructure are safety candidates
where the existing route engine has a meaningful weighting. Theft and
harassment never change an evacuation route, and conflict remains map-only in
this prototype.

Visual weather is independent from observations. A theft or explosion report
cannot start rain, fire, or another simulation effect.

## Trusted write boundary

Both the Human UI and WebMCP call the same TownRepository methods. Shared mode
calls the authenticated-only create_knowledge RPC; direct browser
INSERT/UPDATE/DELETE privileges are revoked by the Phase 10 migration draft.
The RPC derives ownership via the existing owner trigger, fixes the source to
community, validates the observation time, applies coordinate coarsening,
normalizes sensitive public descriptions, creates timestamps, initializes
counters, and derives incident expiry. The extended owner-only update RPC
re-derives the default report type when the category changes, reapplies
metadata and geoprivacy, and resets votes when a meaningful edit is confirmed.

The migration is intentionally a draft. It has not been applied to Supabase,
and the pgTAP file has not been executed.

## Rendering and tools

MapLibre 2D and Navara 3D consume the same snapshot. Both use pending
translucent and community-confirmed stronger rendering, omit expired incidents
from the current overlay, and expose the same safe detail data. Conflict
markers use a neutral alert treatment. Navara falls back to a generic
community marker for unsupported categories and never owns a duplicate
observation store.

The MAP WebMCP surface remains exactly five tools:

contribute_knowledge, delete_knowledge, query_area, update_knowledge, and
verify_knowledge.

contribute_knowledge accepts the expanded category enum plus optional
report_type and observed_at; query_area and update_knowledge accept the
corresponding optional filters/metadata. There is deliberately no
report_observation tool, so existing agent calls using the original flood
contract remain valid.

## Limitations

This layer is a deterministic prototype. The interpreter is keyword based but
parses common relative times such as yesterday / 昨日 and conservatively marks
third-person incidents as heard. PII detection is not complete moderation,
anonymous authentication is not proof of a distinct human, and the
verification threshold does not provide Sybil resistance. CAPTCHA/Turnstile,
rate limiting, delayed/aggregated conflict publication, historical search,
retention/deletion operations, official ingestion, and operational conflict
intelligence remain out of scope. Phase 10 local quality checks do not prove
Supabase migration safety, production deployment, or Native WebMCP behavior.
