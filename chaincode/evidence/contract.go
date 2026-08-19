package main

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// adminMSP is the consortium-admin identity for the PoC. Policy anchoring is
// restricted to this MSP; in production this would be governed by the
// consortium's change-control rules (governance kit, Paper 1 §3.5). This is a
// documented instantiation simplification, not an architectural claim.
const adminMSP = "Org1MSP"

// Composite-key object types.
const (
	objEvent  = "evt"
	objAsset  = "asset"
	objPolicy = "policy"
	objSucc   = "succ" // per-event successor index enabling forward tracing
)

var (
	hashRe     = regexp.MustCompile(`^[0-9a-f]{64}$`)
	validTypes = map[string]bool{
		"Create": true, "Transform": true, "Transfer": true, "Verify": true, "Recall": true,
	}
)

// EvidenceContract implements the governed validation layer of the reference
// architecture: it admits evidence headers, enforces the four validation
// invariants (custody continuity, quantity conservation, verification
// integrity, recall lock — Paper 1 §3.6), and binds each accepted header to
// the governance-policy hash active at submission time (policy-hash
// anchoring, Paper 2 §5.1).
type EvidenceContract struct {
	contractapi.Contract
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

func (c *EvidenceContract) key(ctx contractapi.TransactionContextInterface, obj, id string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(obj, []string{id})
}

func (c *EvidenceContract) getJSON(ctx contractapi.TransactionContextInterface, obj, id string, out interface{}) (bool, error) {
	k, err := c.key(ctx, obj, id)
	if err != nil {
		return false, err
	}
	b, err := ctx.GetStub().GetState(k)
	if err != nil {
		return false, err
	}
	if b == nil {
		return false, nil
	}
	if err := json.Unmarshal(b, out); err != nil {
		return false, err
	}
	return true, nil
}

func (c *EvidenceContract) putJSON(ctx contractapi.TransactionContextInterface, obj, id string, v interface{}) error {
	k, err := c.key(ctx, obj, id)
	if err != nil {
		return err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(k, b)
}

// txTime returns the deterministic transaction timestamp. This is the
// GOVERNANCE APPLICABILITY time used for policy binding — deliberately
// distinct from the client-supplied operational event time in the header
// (architecture §5.1 distinguishes operational event time from governance
// applicability time).
func txTime(ctx contractapi.TransactionContextInterface) (time.Time, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Time{}, fmt.Errorf("cannot read transaction timestamp: %v", err)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC(), nil
}

// ---------------------------------------------------------------------------
// governance registry (policy-hash anchoring) — architecture §5.1
// ---------------------------------------------------------------------------

func (c *EvidenceContract) allPolicies(ctx contractapi.TransactionContextInterface) ([]PolicyVersion, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(objPolicy, []string{})
	if err != nil {
		return nil, err
	}
	defer it.Close()

	out := []PolicyVersion{}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		var p PolicyVersion
		if err := json.Unmarshal(kv.Value, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		ti, _ := time.Parse(time.RFC3339, out[i].EffectiveFrom)
		tj, _ := time.Parse(time.RFC3339, out[j].EffectiveFrom)
		return ti.Before(tj)
	})
	return out, nil
}

// activeAt implements the active-policy function of §5.1:
// active(t) = the version with the greatest effectiveFrom <= t.
// Returns nil when no version is in force at t.
func activeAt(policies []PolicyVersion, t time.Time) *PolicyVersion {
	var act *PolicyVersion
	for i := range policies {
		ef, err := time.Parse(time.RFC3339, policies[i].EffectiveFrom)
		if err != nil {
			continue
		}
		if !ef.After(t) { // ef <= t; list is sorted ascending
			act = &policies[i]
		}
	}
	return act
}

// AnchorPolicy registers a new policy version in the governance registry.
// Restricted to the consortium-admin identity. Enforces strictly increasing
// effectiveFrom timestamps (t_i < t_{i+1}), i.e. prospective supersession:
// a new version never rewrites the binding of already-anchored headers.
func (c *EvidenceContract) AnchorPolicy(ctx contractapi.TransactionContextInterface, version, hash, effectiveFrom string) (*PolicyVersion, error) {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, err
	}
	if msp != adminMSP {
		return nil, fmt.Errorf("GOVERNANCE REJECTION [change control]: AnchorPolicy is restricted to the consortium-admin identity (%s in this PoC); caller is %s", adminMSP, msp)
	}

	hash = strings.ToLower(strings.TrimSpace(hash))
	if !hashRe.MatchString(hash) {
		return nil, fmt.Errorf("REJECTED [schema]: policy hash must be 64 hexadecimal characters (SHA-256), got %q", hash)
	}
	version = strings.TrimSpace(version)
	if version == "" {
		return nil, fmt.Errorf("REJECTED [schema]: policy version identifier is required")
	}
	ef, err := time.Parse(time.RFC3339, effectiveFrom)
	if err != nil {
		return nil, fmt.Errorf("REJECTED [schema]: effectiveFrom must be RFC3339, got %q", effectiveFrom)
	}

	pols, err := c.allPolicies(ctx)
	if err != nil {
		return nil, err
	}
	for _, p := range pols {
		if p.Version == version {
			return nil, fmt.Errorf("REJECTED [duplicate]: policy version %q is already anchored", version)
		}
		pef, _ := time.Parse(time.RFC3339, p.EffectiveFrom)
		if !ef.After(pef) {
			return nil, fmt.Errorf("GOVERNANCE REJECTION [ordering]: effectiveFrom %s must be strictly after existing version %s (%s); policy supersession is prospective", effectiveFrom, p.Version, p.EffectiveFrom)
		}
	}

	now, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	pv := PolicyVersion{
		Version:       version,
		Hash:          hash,
		EffectiveFrom: ef.UTC().Format(time.RFC3339),
		AnchoredBy:    msp,
		AnchoredAt:    now.Format(time.RFC3339),
	}
	if err := c.putJSON(ctx, objPolicy, version, pv); err != nil {
		return nil, err
	}
	return &pv, nil
}

// GetActivePolicy resolves active(t). Empty atTime means "now" (tx time).
func (c *EvidenceContract) GetActivePolicy(ctx contractapi.TransactionContextInterface, atTime string) (*PolicyVersion, error) {
	var t time.Time
	var err error
	if strings.TrimSpace(atTime) == "" {
		t, err = txTime(ctx)
		if err != nil {
			return nil, err
		}
	} else {
		t, err = time.Parse(time.RFC3339, atTime)
		if err != nil {
			return nil, fmt.Errorf("REJECTED [schema]: atTime must be RFC3339, got %q", atTime)
		}
	}
	pols, err := c.allPolicies(ctx)
	if err != nil {
		return nil, err
	}
	act := activeAt(pols, t)
	if act == nil {
		return nil, fmt.Errorf("no governance policy is active at %s", t.UTC().Format(time.RFC3339))
	}
	return act, nil
}

// PolicyHistory returns all anchored policy versions ordered by effectiveFrom
// (verifiability invariant: an auditor resolves any bound hash against this
// registry and recomputes it over the off-ledger policy text).
func (c *EvidenceContract) PolicyHistory(ctx contractapi.TransactionContextInterface) ([]PolicyVersion, error) {
	return c.allPolicies(ctx)
}

// GetPolicy returns one policy version by identifier.
func (c *EvidenceContract) GetPolicy(ctx contractapi.TransactionContextInterface, version string) (*PolicyVersion, error) {
	var p PolicyVersion
	found, err := c.getJSON(ctx, objPolicy, version, &p)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("policy version %q is not anchored", version)
	}
	return &p, nil
}

// ---------------------------------------------------------------------------
// governed evidence admission — Paper 1 §3.6 invariants + §5.1 binding
// ---------------------------------------------------------------------------

// CreateHeader validates and anchors one evidence header. Validation order:
// schema -> duplicate -> predecessor existence -> event-type invariants ->
// totality/policy binding -> persist. Rejection messages carry the invariant
// name in brackets so they can be pasted verbatim into Paper 3 §6.1.
func (c *EvidenceContract) CreateHeader(ctx contractapi.TransactionContextInterface, headerJSON string) (*EvidenceHeader, error) {
	var h EvidenceHeader
	if err := json.Unmarshal([]byte(headerJSON), &h); err != nil {
		return nil, fmt.Errorf("REJECTED [schema]: header is not valid JSON: %v", err)
	}

	// --- schema: required base fields ---
	required := map[string]string{
		"eventID": h.EventID, "eventType": h.EventType, "assetID": h.AssetID,
		"actorOrg": h.ActorOrg, "timestamp": h.Timestamp,
		"payloadHash": h.PayloadHash, "schemaID": h.SchemaID,
	}
	for _, f := range []string{"eventID", "eventType", "assetID", "actorOrg", "timestamp", "payloadHash", "schemaID"} {
		if strings.TrimSpace(required[f]) == "" {
			return nil, fmt.Errorf("REJECTED [schema]: field %q is required", f)
		}
	}
	if h.PredecessorIDs == nil {
		h.PredecessorIDs = []string{} // nil marshals to null and fails the array schema
	}
	if !validTypes[h.EventType] {
		return nil, fmt.Errorf("REJECTED [schema]: eventType %q is not one of Create|Transform|Transfer|Verify|Recall", h.EventType)
	}
	if _, err := time.Parse(time.RFC3339, h.Timestamp); err != nil {
		return nil, fmt.Errorf("REJECTED [schema]: timestamp must be RFC3339, got %q", h.Timestamp)
	}

	// --- verification integrity: payload hash well-formedness ---
	// Applied to every event type; named per Paper 1 §3.6 for Verify events.
	h.PayloadHash = strings.ToLower(strings.TrimSpace(h.PayloadHash))
	if !hashRe.MatchString(h.PayloadHash) {
		tag := "schema"
		if h.EventType == "Verify" {
			tag = "verification integrity"
		}
		return nil, fmt.Errorf("INVARIANT VIOLATION [%s]: payloadHash must be a 64-character SHA-256 hex digest referencing the attestation payload", tag)
	}

	// --- duplicate / immutability by absence of update paths ---
	var dup EvidenceHeader
	if found, err := c.getJSON(ctx, objEvent, h.EventID, &dup); err != nil {
		return nil, err
	} else if found {
		return nil, fmt.Errorf("REJECTED [duplicate]: eventID %q is already anchored; anchored headers are immutable", h.EventID)
	}

	// --- lineage: every predecessor must already be anchored ---
	for _, p := range h.PredecessorIDs {
		var pe EvidenceHeader
		found, err := c.getJSON(ctx, objEvent, p, &pe)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("REJECTED [lineage]: predecessor event %q does not exist", p)
		}
	}

	// --- event-type-specific invariants; state effects are collected and
	//     applied only after policy binding succeeds ---
	newAssets := map[string]AssetState{}   // assets to create
	touched := map[string]*AssetState{}    // existing assets to update
	loadAsset := func(id string) (*AssetState, bool, error) {
		if a, ok := touched[id]; ok {
			return a, true, nil
		}
		var a AssetState
		found, err := c.getJSON(ctx, objAsset, id, &a)
		if err != nil || !found {
			return nil, found, err
		}
		touched[id] = &a
		return &a, true, nil
	}

	switch h.EventType {

	case "Create":
		if _, found, err := loadAsset(h.AssetID); err != nil {
			return nil, err
		} else if found {
			return nil, fmt.Errorf("REJECTED [asset]: asset %q already exists; Create must introduce a new lot", h.AssetID)
		}
		newAssets[h.AssetID] = AssetState{AssetID: h.AssetID, CurrentCustodian: h.ActorOrg}

	case "Transform":
		if h.Transform == nil || len(h.Transform.Inputs) == 0 || len(h.Transform.Outputs) == 0 {
			return nil, fmt.Errorf("REJECTED [quantity conservation]: Transform requires a quantity manifest with at least one input and one output")
		}
		if h.Transform.Tolerance < 0 {
			return nil, fmt.Errorf("REJECTED [schema]: transform tolerance must be >= 0")
		}
		var sumIn, sumOut float64
		for _, in := range h.Transform.Inputs {
			a, found, err := loadAsset(in.AssetID)
			if err != nil {
				return nil, err
			}
			if !found {
				return nil, fmt.Errorf("REJECTED [lineage]: Transform input asset %q does not exist", in.AssetID)
			}
			_ = a
			sumIn += in.Quantity
		}
		assetInOutputs := false
		for _, out := range h.Transform.Outputs {
			if _, found, err := loadAsset(out.AssetID); err != nil {
				return nil, err
			} else if found {
				return nil, fmt.Errorf("REJECTED [asset]: Transform output %q already exists; outputs must be new lots", out.AssetID)
			}
			if out.AssetID == h.AssetID {
				assetInOutputs = true
			}
			sumOut += out.Quantity
			newAssets[out.AssetID] = AssetState{AssetID: out.AssetID, CurrentCustodian: h.ActorOrg}
		}
		if !assetInOutputs {
			return nil, fmt.Errorf("REJECTED [schema]: header assetID %q must appear among the transform outputs", h.AssetID)
		}
		allowed := h.Transform.Tolerance
		if allowed == 0 {
			allowed = 1e-9 // exact conservation, floating-point safe
		}
		if diff := math.Abs(sumIn - sumOut); diff > allowed {
			return nil, fmt.Errorf("INVARIANT VIOLATION [quantity conservation]: inputs total %.4f, outputs total %.4f, difference %.4f exceeds tolerance %.4f", sumIn, sumOut, diff, h.Transform.Tolerance)
		}

	case "Transfer":
		a, found, err := loadAsset(h.AssetID)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", h.AssetID)
		}
		if a.Recalled {
			return nil, fmt.Errorf("INVARIANT VIOLATION [recall lock]: asset %q is under recall; further transfers are blocked until the recall is cleared", h.AssetID)
		}
		if a.CurrentCustodian != h.ActorOrg {
			return nil, fmt.Errorf("INVARIANT VIOLATION [custody continuity]: Transfer of asset %q submitted by %q, but current custodian is %q — only the current custodian may record a transfer", h.AssetID, h.ActorOrg, a.CurrentCustodian)
		}
		if strings.TrimSpace(h.NewCustodian) == "" {
			return nil, fmt.Errorf("REJECTED [schema]: Transfer requires field \"newCustodian\"")
		}
		a.CurrentCustodian = h.NewCustodian

	case "Verify":
		if _, found, err := loadAsset(h.AssetID); err != nil {
			return nil, err
		} else if !found {
			return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", h.AssetID)
		}

	case "Recall":
		a, found, err := loadAsset(h.AssetID)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", h.AssetID)
		}
		a.Recalled = true
	}

	// --- totality + policy-hash binding (the mechanism under test, §5.1) ---
	now, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	pols, err := c.allPolicies(ctx)
	if err != nil {
		return nil, err
	}
	act := activeAt(pols, now)
	if act == nil {
		return nil, fmt.Errorf("INVARIANT VIOLATION [totality]: no governance policy is active at submission time %s; every accepted header must bind exactly one policy hash", now.Format(time.RFC3339))
	}
	h.PolicyHash = act.Hash       // binding — client-supplied values are overwritten
	h.PolicyVersion = act.Version // convenience reference for exports
	h.BoundAt = now.Format(time.RFC3339)

	// --- signature (instantiation choice: submitting Fabric identity) ---
	if strings.TrimSpace(h.ActorSignature) == "" {
		msp, _ := ctx.GetClientIdentity().GetMSPID()
		id, _ := ctx.GetClientIdentity().GetID()
		h.ActorSignature = fmt.Sprintf("fabric-msp:%s;id:%s", msp, id)
	}

	// --- persist header, asset states, event indexes, successor index ---
	if err := c.putJSON(ctx, objEvent, h.EventID, h); err != nil {
		return nil, err
	}
	appendEvent := func(a *AssetState) {
		a.EventIDs = append(a.EventIDs, h.EventID)
	}
	for id, a := range newAssets {
		st := a
		appendEvent(&st)
		if err := c.putJSON(ctx, objAsset, id, st); err != nil {
			return nil, err
		}
	}
	// For Transform, register the event on input assets too (lineage seeds).
	if h.EventType == "Transform" {
		for _, in := range h.Transform.Inputs {
			if a, ok := touched[in.AssetID]; ok {
				appendEvent(a)
			}
		}
	}
	for id, a := range touched {
		if _, isNew := newAssets[id]; isNew {
			continue
		}
		if h.EventType != "Transform" && id == h.AssetID {
			appendEvent(a)
		}
		if err := c.putJSON(ctx, objAsset, id, *a); err != nil {
			return nil, err
		}
	}
	for _, p := range h.PredecessorIDs {
		var succ []string
		_, _ = c.getJSON(ctx, objSucc, p, &succ)
		succ = append(succ, h.EventID)
		if err := c.putJSON(ctx, objSucc, p, succ); err != nil {
			return nil, err
		}
	}

	return &h, nil
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

// GetHeader returns one anchored evidence header.
func (c *EvidenceContract) GetHeader(ctx contractapi.TransactionContextInterface, eventID string) (*EvidenceHeader, error) {
	var h EvidenceHeader
	found, err := c.getJSON(ctx, objEvent, eventID, &h)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("event %q is not anchored", eventID)
	}
	if h.PredecessorIDs == nil {
		h.PredecessorIDs = []string{}
	}
	return &h, nil
}

// GetAssetState returns custody and recall status for one asset.
func (c *EvidenceContract) GetAssetState(ctx contractapi.TransactionContextInterface, assetID string) (*AssetState, error) {
	var a AssetState
	found, err := c.getJSON(ctx, objAsset, assetID, &a)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", assetID)
	}
	if a.EventIDs == nil {
		a.EventIDs = []string{}
	}
	return &a, nil
}

// IsRecalled reports whether an asset is under an active recall lock.
func (c *EvidenceContract) IsRecalled(ctx contractapi.TransactionContextInterface, assetID string) (bool, error) {
	a, err := c.GetAssetState(ctx, assetID)
	if err != nil {
		return false, err
	}
	return a.Recalled, nil
}

// GetLineageByAsset reconstructs the full lineage DAG connected to an asset:
// backward over predecessor links (trace to origin) and forward over the
// successor index (trace to affected descendants), per Paper 1 §3.3. The
// result reports node/edge counts and origin Create events explicitly,
// matching the artifacts Paper 3 §6.1 asks for.
func (c *EvidenceContract) GetLineageByAsset(ctx contractapi.TransactionContextInterface, assetID string) (*LineageGraph, error) {
	var asset AssetState
	found, err := c.getJSON(ctx, objAsset, assetID, &asset)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", assetID)
	}

	visited := map[string]*EvidenceHeader{}
	edges := map[string]LineageEdge{}
	queue := append([]string{}, asset.EventIDs...)

	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if _, ok := visited[id]; ok {
			continue
		}
		var h EvidenceHeader
		found, err := c.getJSON(ctx, objEvent, id, &h)
		if err != nil {
			return nil, err
		}
		if !found {
			continue
		}
		visited[id] = &h
		for _, p := range h.PredecessorIDs {
			edges[p+"->"+id] = LineageEdge{From: p, To: id}
			queue = append(queue, p)
		}
		var succ []string
		if ok, err := c.getJSON(ctx, objSucc, id, &succ); err == nil && ok {
			for _, s := range succ {
				edges[id+"->"+s] = LineageEdge{From: id, To: s}
				queue = append(queue, s)
			}
		}
	}

	g := &LineageGraph{
		AssetID:       assetID,
		Nodes:         []LineageNode{},
		Edges:         []LineageEdge{},
		OriginCreates: []string{},
	}
	for _, h := range visited {
		g.Nodes = append(g.Nodes, LineageNode{
			EventID: h.EventID, EventType: h.EventType, AssetID: h.AssetID,
			ActorOrg: h.ActorOrg, Timestamp: h.Timestamp, PolicyVersion: h.PolicyVersion,
		})
		if h.EventType == "Create" {
			g.OriginCreates = append(g.OriginCreates, h.EventID)
		}
	}
	sort.Slice(g.Nodes, func(i, j int) bool {
		if g.Nodes[i].Timestamp == g.Nodes[j].Timestamp {
			return g.Nodes[i].EventID < g.Nodes[j].EventID
		}
		return g.Nodes[i].Timestamp < g.Nodes[j].Timestamp
	})
	sort.Strings(g.OriginCreates)
	for _, e := range edges {
		g.Edges = append(g.Edges, e)
	}
	sort.Slice(g.Edges, func(i, j int) bool {
		if g.Edges[i].From == g.Edges[j].From {
			return g.Edges[i].To < g.Edges[j].To
		}
		return g.Edges[i].From < g.Edges[j].From
	})
	g.NodeCount = len(g.Nodes)
	g.EdgeCount = len(g.Edges)
	return g, nil
}
