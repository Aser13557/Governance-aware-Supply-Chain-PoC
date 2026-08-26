# Validation surface

Every admission check the chaincode performs, with the captured rejection that demonstrates it.

| Check | Condition | Source | Evidence | Correctly tagged |
|---|---|---|---|---|
| `[totality]` | no governance policy in force at submission | architecture 5.1 | `S0_totality_rejection.txt` | yes |
| `[custody continuity]` | transfer by a party that is not the current custodian | model 3.6 | `N-CUSTODY.txt` | yes |
| `[recall lock]` | transfer of a lot under recall | model 3.6 | `N-RECALL-TRANSFER.txt` | yes |
| `[recall lock]` | transformation consuming a lot under recall | model 3.6 / 3.8 | `N-RECALL-TRANSFORM.txt` | yes |
| `[quantity conservation]` | imbalance beyond the tolerance in force | model 3.6 | `N-QTY-TOLERANCE.txt` | yes |
| `[quantity conservation]` | consuming more of a lot than remains | model 3.6 | `N-QTY-AVAILABLE.txt` | yes |
| `[quantity conservation]` | inputs and outputs in different units | model 3.6 | `N-QTY-UNIT.txt` | yes |
| `[quantity conservation]` | imbalance admissible under v1.0, refused under v2.0 | architecture R4 | `S3-P4.txt` | yes |
| `[verification integrity]` | malformed attestation digest | model 3.6 | `N-VERIFY-DIGEST.txt` | yes |
| `[verification integrity]` | self-attestation by the current custodian, refused under v2.0 | architecture R4 | `N-VERIFY-SELF.txt` | yes |
| `[asset]` | transfer of a fully consumed lot | model 3.6 (derived) | `N-CONSUMED.txt` | yes |
| `[schema]` | event type outside the five-event vocabulary | model 3.2 | `N-SCHEMA-TYPE.txt` | yes |
| `[lineage]` | predecessor that was never anchored | model 3.3 | `N-PREDECESSOR.txt` | yes |
| `[duplicate]` | re-anchoring an existing event identifier | immutability | `N-DUPLICATE.txt` | yes |
| `[change control]` | policy anchored by a non-admin organization | model 3.5 | `N-POLICY-NONADMIN.txt` | yes |
| `[change control]` | recall cleared by a non-admin organization | model 3.5 | `N-CLEAR-NONADMIN.txt` | yes |
| `[retroactivity]` | validity start earlier than the anchoring time | architecture 5.1 | `N-POLICY-RETRO.txt` | yes |
| `[ordering]` | validity start at or before a version already scheduled | architecture 5.1 | `N-POLICY-ORDER.txt` | yes |

18 of 18 checks demonstrated by a correctly tagged rejection.
