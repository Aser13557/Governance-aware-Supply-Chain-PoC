package main

// EvidenceHeader is the minimal on-ledger evidence object (architecture §4.1).
//
// The ten base fields are those specified by the conceptual model. Two
// quantitative extensions are added — Quantity on Create events and Transform
// on Transform events — because the quantity-conservation invariant cannot be
// evaluated at admission if the quantities live only in the confidential
// payload. Placing the minimum quantitative facts in the header is what makes
// the invariant enforceable WITHOUT payload disclosure; everything else about
// the production order stays off-ledger.
//
// Fields written exclusively by the chaincode (PolicyHash, PolicyVersion,
// BoundAt) are never accepted from the client.
type EvidenceHeader struct {
	EventID        string   `json:"eventID"`
	EventType      string   `json:"eventType"` // Create | Transform | Transfer | Verify | Recall
	AssetID        string   `json:"assetID"`
	ActorOrg       string   `json:"actorOrg"`  // logical organization; maps onto test-network MSPs
	Timestamp      string   `json:"timestamp"` // OPERATIONAL event time, RFC3339, client-supplied
	PredecessorIDs []string `json:"predecessorIDs"`
	PayloadHash    string   `json:"payloadHash"` // SHA-256 hex of the off-ledger payload
	SchemaID       string   `json:"schemaID"`
	ActorSignature string   `json:"actorSignature"` // filled from the submitting Fabric identity if empty

	// Event-type-specific extensions. Optional in the generated schema because
	// each is present on only one event type.
	Quantity     *QuantityDecl      `json:"quantity,omitempty" metadata:"quantity,optional"`         // Create events
	Transform    *TransformManifest `json:"transform,omitempty" metadata:"transform,optional"`       // Transform events
	NewCustodian string             `json:"newCustodian,omitempty" metadata:"newCustodian,optional"` // Transfer events

	// Set by the chaincode at acceptance time — never by the client:
	PolicyHash    string `json:"policyHash"`    // hash of the governing policy artifact
	PolicyVersion string `json:"policyVersion"` // convenience reference for audit-pack assembly
	BoundAt       string `json:"boundAt"`       // GOVERNANCE APPLICABILITY time = transaction timestamp
}

// QuantityDecl is the quantity a Create event introduces into the system.
type QuantityDecl struct {
	Value float64 `json:"value"`
	Unit  string  `json:"unit"`
}

// LotQuantity is one (asset, quantity) pair in a Transform manifest.
type LotQuantity struct {
	AssetID  string  `json:"assetID"`
	Quantity float64 `json:"quantity"`
}

// TransformManifest carries the quantities consumed and produced.
//
// It deliberately carries NO tolerance: the tolerance applied to the
// conservation check is a governance parameter resolved from the active policy
// version, not a value the submitting party may choose for its own submission.
type TransformManifest struct {
	Inputs  []LotQuantity `json:"inputs"`
	Outputs []LotQuantity `json:"outputs"`
	Unit    string        `json:"unit"` // all inputs and outputs must share this unit
}

// AssetState tracks per-asset custody, quantity and recall status, plus the
// events that reference the asset (used as lineage seeds).
type AssetState struct {
	AssetID          string   `json:"assetID"`
	CurrentCustodian string   `json:"currentCustodian"`
	Quantity         float64  `json:"quantity"` // remaining quantity, reduced as transformations consume it
	Unit             string   `json:"unit"`
	Recalled         bool     `json:"recalled"`
	Consumed         bool     `json:"consumed"` // fully consumed by transformation; no longer transferable
	EventIDs         []string `json:"eventIDs"`
}

// PolicyParams are the machine-readable validation parameters carried by a
// governance policy version. They are what makes a policy change alter
// validation behaviour rather than merely being recorded: the architecture
// requires that a governance reference change admissibility for new
// submissions, so the parameters governing admission must come from the
// registry and not from the submitter.
//
// The parameters are published inside the policy artifact itself, so the
// anchored hash covers them and an auditor can confirm that the values held in
// the registry are the values stated in the policy text.
type PolicyParams struct {
	QuantityTolerance           float64 `json:"quantityTolerance"`           // permitted |inputs - outputs| on a Transform
	VerifyRequiresDistinctActor bool    `json:"verifyRequiresDistinctActor"` // a Verify may not be submitted by the current custodian
	RecallBlocksTransform       bool    `json:"recallBlocksTransform"`       // a recalled lot may not be an input to a Transform
}

// PolicyVersion is one entry in the governance registry (architecture §5.1).
type PolicyVersion struct {
	Version       string       `json:"version"`
	Hash          string       `json:"hash"`          // SHA-256 hex over the off-ledger policy text
	EffectiveFrom string       `json:"effectiveFrom"` // RFC3339; strictly increasing, never retroactive
	Params        PolicyParams `json:"params"`
	AnchoredBy    string       `json:"anchoredBy"`
	AnchoredAt    string       `json:"anchoredAt"`
}

// RecallClearance records the governance act that lifts a recall lock.
//
// Clearing is not one of the five event types, so it is recorded as a distinct
// governance object rather than as an evidence header — keeping the event
// vocabulary intact while making the model's "until cleared" condition real.
type RecallClearance struct {
	AssetID       string `json:"assetID"`
	Reason        string `json:"reason"`
	ClearedBy     string `json:"clearedBy"`
	ClearedAt     string `json:"clearedAt"`
	PolicyVersion string `json:"policyVersion"`
	PolicyHash    string `json:"policyHash"`
}

// RecallStatus reports the current lock state and any clearance on record.
type RecallStatus struct {
	AssetID   string           `json:"assetID"`
	Recalled  bool             `json:"recalled"`
	Clearance *RecallClearance `json:"clearance,omitempty" metadata:"clearance,optional"`
}

// LineageNode / LineageEdge / LineageGraph form the DAG returned by
// GetLineageByAsset.
type LineageNode struct {
	EventID       string `json:"eventID"`
	EventType     string `json:"eventType"`
	AssetID       string `json:"assetID"`
	ActorOrg      string `json:"actorOrg"`
	Timestamp     string `json:"timestamp"`
	PolicyVersion string `json:"policyVersion"`
}

type LineageEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type LineageGraph struct {
	AssetID       string        `json:"assetID"`
	Nodes         []LineageNode `json:"nodes"`
	Edges         []LineageEdge `json:"edges"`
	NodeCount     int           `json:"nodeCount"`
	EdgeCount     int           `json:"edgeCount"`
	OriginCreates []string      `json:"originCreates"` // backward-trace-to-origin result
}

// DescendantSet is the forward-trace result used in a recall investigation:
// the lots reachable from the queried asset, which are the lots a recall must
// consider (conceptual model §3.8).
type DescendantSet struct {
	AssetID     string   `json:"assetID"`
	Descendants []string `json:"descendants"`
	Count       int      `json:"count"`
	ViaEvents   []string `json:"viaEvents"`
}

// TraceMetrics instruments the two lineage-derived indicators defined by the
// conceptual model §3.7. Dispute cycle time is not instrumented because the
// prototype does not implement the dispute governance domain; it is reported
// explicitly as not measured rather than silently omitted.
type TraceMetrics struct {
	AssetID              string   `json:"assetID"`
	QueriedEvent         string   `json:"queriedEvent"`     // latest event on the lineage path
	QueriedEventTime     string   `json:"queriedEventTime"` //
	EarliestCreate       string   `json:"earliestCreate"`   // earliest Create on the lineage path
	EarliestCreateTime   string   `json:"earliestCreateTime"`
	TimeToTraceSeconds   int64    `json:"timeToTraceSeconds"` // §3.7 time-to-trace
	AuditHandoffs        int      `json:"auditHandoffs"`      // §3.7 organization changes along the path
	PathEvents           []string `json:"pathEvents"`        // the minimal evidence path, origin first
	PathOrganizations    []string `json:"pathOrganizations"` // organizations in path order
	QueriedEventRule     string   `json:"queriedEventRule"`  // how the queried event was selected
	PathRule             string   `json:"pathRule"`          // how the minimal path was chosen
	DisputeCycleSeconds  int64    `json:"disputeCycleSeconds"`
	DisputeCycleReported bool     `json:"disputeCycleReported"`
}
