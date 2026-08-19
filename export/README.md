# export (Day 4) — contract, pre-decided

Node + fabric-network SDK (Gateway, connection profile from test-network).

- `lineageTrace(assetID)`  → chaincode GetLineageByAsset passthrough; MUST surface nodeCount/edgeCount/originCreates (§6.1 artifacts)
- `auditPack(assetID, requestorRole)` → `{scope, events:[ordered bound headers], policyRefs:[{eventID, policyVersion, policyHash}], payloadRefs:[hashes], verification:[{hash, pass|fail}], generatedInMs}` — generatedInMs is the §6.2 "generation time"
- `passportView(assetID)`  → `{assetID, currentCustodian, lastTransfer, attestations:[Verify events], recallStatus, policyVersionAtLastEvent}`

Verification step calls payload-store GET per hash and records pass/fail —
including the deliberately tampered payload (fail expected).
