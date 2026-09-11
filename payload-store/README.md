# payload-store (Day 3) — API contract, pre-decided

Single-file Node/Express service. File-system storage + `index.json`. No DB.
Satisfies the §4.2 sentence "SHA-256 content addressing with role-gated
retrieval" — the role gate MUST actually be enforced or that sentence is false.

- `POST /payload`            body: JSON payload → stores it, returns `{hash, id, storedAt}` (hash = SHA-256 hex over canonical bytes)
- `GET  /payload/:hash`      header `X-Role: operator|auditor|authority` required; recomputes hash on read and returns `{payload, verified: true|false}` — verified:false is the tamper-test artifact (E3)
- `GET  /health`

Store payloads as raw bytes exactly as hashed (no re-serialization), else
verification breaks.

## Role header values and the three tiers

`X-Role` accepts `public`, `operator`, `auditor` and `authority`. They map onto the
architecture's three visibility tiers as follows: `public` → public lineage
visibility (integrity confirmation only, no content); `operator` and `auditor` →
consortium-internal evidence visibility (content); `authority` → authority-facing
audit visibility (content). Run 12 exercised `public`, `operator`, `authority` and an
unauthenticated request (`S5_disclosure_tiers.json`); `auditor` is an alias of the
consortium-internal tier and was not separately exercised. `GET /verify/:hash` is
tier-independent and returns no content; audit-pack assembly uses it.
