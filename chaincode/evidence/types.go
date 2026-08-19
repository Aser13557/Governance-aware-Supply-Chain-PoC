package main

// EvidenceHeader is the minimal on-ledger evidence object (architecture §4.1).
// Ten base fields as specified in Paper 2, plus two event-type-specific
// extensions (Transform, NewCustodian) that make the validation invariants
// checkable at submission time WITHOUT payload disclosure, plus two fields
// set exclusively by the chaincode (PolicyHash/PolicyVersion/BoundAt).
//
// IMPORTANT: PolicyHash is never accepted from the client. The chaincode
// overwrites it with the hash of the policy version active at the
// transaction timestamp (totality invariant, architecture §5.1).
type EvidenceHeader struct {
	EventID        string   `json:"eventID"`
	EventType      string   `json:"eventType"` // Create | Transform | Transfer | Verify | Recall
	AssetID        string   `json:"assetID"`
	ActorOrg       string   `json:"actorOrg"`  // logical organization; maps onto test-network MSPs (paper §4.2)
	Timestamp      string   `json:"timestamp"` // OPERATIONAL event time, RFC3339, client-supplied
	PredecessorIDs []string `json:"predecessorIDs"`
	PayloadHash    string   `json:"payloadHash"` // SHA-256 hex of the off-ledger payload
	SchemaID       string   `json:"schemaID"`
	ActorSignature string   `json:"actorSignature"` // instantiation choice: filled from the submitting Fabric identity if empty

	// Event-type-specific extensions. These are absent on most event types, so
	// they carry `metadata:",optional"` — contractapi generates a JSON schema
	// from this struct and validates every SUCCESSFUL return against it,
	// treating each field as required unless this tag says otherwise. Without
	// it, the first accepted Create event fails with
	// "Value did not match schema: transform is required".
	Transform    *TransformManifest `json:"transform,omitempty" metadata:"transform,optional"`       // present only on Transform events
	NewCustodian string             `json:"newCustodian,omitempty" metadata:"newCustodian,optional"` // present only on Transfer events

	// Set by the chaincode at acceptance time — never by the client:
	PolicyHash    string `json:"policyHash"`    // hash of the governing policy artifact (bound, immutable)
	PolicyVersion string `json:"policyVersion"` // convenience reference for audit-pack assembly
	BoundAt       string `json:"boundAt"`       // GOVERNANCE APPLICABILITY time = tx timestamp (§5.1 distinguishes this from Timestamp)
}

// LotQuantity is one (asset, quantity) pair in a Transform manifest.
type LotQuantity struct {
	AssetID  string  `json:"assetID"`
	Quantity float64 `json:"quantity"`
}

// TransformManifest carries the minimal quantity data needed to enforce the
// quantity-conservation invariant on-chain. Keeping quantities in a compact
// header-level manifest (rather than in the confidential payload) is what
// makes the invariant enforceable at validation time without disclosure of
// the underlying production order.
type TransformManifest struct {
	Inputs    []LotQuantity `json:"inputs"`
	Outputs   []LotQuantity `json:"outputs"`
	Tolerance float64       `json:"tolerance"` // allowed absolute imbalance in the same units; 0 = exact
}

// AssetState tracks per-asset custody and recall status plus the events that
// reference the asset (used as lineage seeds).
type AssetState struct {
	AssetID          string   `json:"assetID"`
	CurrentCustodian string   `json:"currentCustodian"`
	Recalled         bool     `json:"recalled"`
	EventIDs         []string `json:"eventIDs"`
}

// PolicyVersion is one entry in the governance registry (architecture §5.1):
// stable identifier, effective-from timestamp, anchored hash over the policy
// text, and anchoring metadata.
type PolicyVersion struct {
	Version       string `json:"version"`
	Hash          string `json:"hash"`          // SHA-256 hex over the off-ledger policy text
	EffectiveFrom string `json:"effectiveFrom"` // RFC3339; strictly increasing across versions (prospective supersession)
	AnchoredBy    string `json:"anchoredBy"`
	AnchoredAt    string `json:"anchoredAt"`
}

// LineageNode / LineageEdge / LineageGraph form the DAG returned by
// GetLineageByAsset. NodeCount and EdgeCount are included explicitly because
// Paper 3 §6.1 reports lineage output as node/edge counts.
type LineageNode struct {
	EventID       string `json:"eventID"`
	EventType     string `json:"eventType"`
	AssetID       string `json:"assetID"`
	ActorOrg      string `json:"actorOrg"`
	Timestamp     string `json:"timestamp"`
	PolicyVersion string `json:"policyVersion"`
}

type LineageEdge struct {
	From string `json:"from"` // predecessor eventID
	To   string `json:"to"`   // successor eventID
}

type LineageGraph struct {
	AssetID       string        `json:"assetID"`
	Nodes         []LineageNode `json:"nodes"`
	Edges         []LineageEdge `json:"edges"`
	NodeCount     int           `json:"nodeCount"`
	EdgeCount     int           `json:"edgeCount"`
	OriginCreates []string      `json:"originCreates"` // backward-trace-to-origin result (Paper 3 §6.1)
}
