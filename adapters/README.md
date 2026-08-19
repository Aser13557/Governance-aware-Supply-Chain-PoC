# adapters (Day 4) — contract, pre-decided

Four pure mapping functions, zero I/O beyond fixtures. Each takes a
source-shaped mock record and returns `{header, payload}` in the SAME
normalized schema — the S1 agnosticism proof is that these differ while the
chaincode has zero source-system branches.

- `erp.js`   → Create events        (fixtures: C1.json, C2.json, D1.json, S3-R1.json source records)
- `mes.js`   → Transform events     (T1 with quantity manifest: A 600 + B 400 → C 1000, tol 0.5)
- `tms.js`   → Transfer events      (TR1, TD1, TD2, S3-R5; submitter = current custodian, per §3.6)
- `lims.js`  → Verify events        (V1, VD1, S3-R2..R4)

Recall events (R1) are emitted by a trivial `retailer.js`.
`fixtures/` holds both the source-shaped inputs and the expected normalized
headers, so the S1 comparison table can diff them mechanically.
