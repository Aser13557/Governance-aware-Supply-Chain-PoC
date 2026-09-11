# S4 — Validation surface

Scenario S4 exercises the **twenty-two semantic admission checks** enumerated below — the nine checks of the conceptual model's four invariants and the totality check (`INVARIANT VIOLATION`, 10), four schema and lineage well-formedness checks (`REJECTED`, 4), and eight governance-kit checks (`GOVERNANCE REJECTION`, 8). Each is demonstrated by a rejection carrying its own tag; a rejection for the wrong reason fails the run.

Two checks present in the chaincode are **not exercised by a rejection in run 12 and are not counted**: the maximum permitted event-time divergence (the v2.0 limit of 8760 hours exceeds the divergence present in the fixtures) and the refusal of a submission by an organization that was never admitted.

The ordering condition is exercised by anchoring policy v3.0, scheduled to take effect after the run and never in force during it, and then refusing a version whose validity start falls at or before it.

Raw peer output is archived beside each parsed message. Corresponds to dissertation §5.11 / Table 5.7 and, in the MBD 2026 submission, §V-D / Table II.
