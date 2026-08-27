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

// foundingAuthority is the identity designated by the consortium's founding
// agreement as authorised to anchor the first policy version. Every subsequent
// version's authority is designated by its predecessor, so the right to change
// policy is itself an auditable chain rather than a standing configuration.
const foundingAuthority = "Org1MSP"

// Composite-key object types.
const (
	objEvent     = "evt"
	objAsset     = "asset"
	objPolicy    = "policy"
	objSucc      = "succ"  // per-event successor index enabling forward tracing
	objClearance = "clear" // recall clearances
	objMember    = "member"
	objDispute   = "dispute"
	objEmergency = "emerg"
)

// hashAlgorithm is recorded alongside every anchored digest so that the
// algorithm can be migrated as cryptographic practice evolves without making
// historical digests ambiguous.
const hashAlgorithm = "SHA-256"

// canonicalForm names the canonicalisation applied to a policy artifact before
// hashing, so that semantically identical artifacts yield identical digests.
const canonicalForm = "UTF-8, LF line endings, no trailing whitespace"

var (
	hashRe     = regexp.MustCompile(`^[0-9a-f]{64}$`)
	validTypes = map[string]bool{
		"Create": true, "Transform": true, "Transfer": true, "Verify": true, "Recall": true,
	}
)

// qtyEpsilon absorbs binary floating-point representation error so that an
// exact balance is not reported as a violation.
const qtyEpsilon = 1e-9

// EvidenceContract implements the governed validation layer: it admits
// evidence headers, enforces the four validation invariants of the conceptual
// model §3.6 under parameters drawn from the active governance policy, and
// binds each accepted header to that policy's hash (architecture §5.1).
type EvidenceContract struct {
	contractapi.Contract
}

// ---------------------------------------------------------------------------
// storage helpers
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
// distinct from the client-supplied operational event time in the header.
func txTime(ctx contractapi.TransactionContextInterface) (time.Time, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Time{}, fmt.Errorf("cannot read transaction timestamp: %v", err)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC(), nil
}

func callerMSP(ctx contractapi.TransactionContextInterface) (string, error) {
	return ctx.GetClientIdentity().GetMSPID()
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
func activeAt(policies []PolicyVersion, t time.Time) *PolicyVersion {
	var act *PolicyVersion
	for i := range policies {
		ef, err := time.Parse(time.RFC3339, policies[i].EffectiveFrom)
		if err != nil {
			continue
		}
		if !ef.After(t) {
			act = &policies[i]
		}
	}
	return act
}

// AnchorPolicy registers a new policy version together with the validation
// parameters it puts into force.
//
// Three conditions are enforced. The caller must be the consortium-admin
// identity. The validity start must be strictly later than every version
// already anchored, so validity intervals are well ordered. And the validity
// start may not precede the moment of anchoring, so the registry cannot be made
// to assert retroactively that a regime was in force during a period in which
// records were admitted under a different one.
func (c *EvidenceContract) AnchorPolicy(ctx contractapi.TransactionContextInterface, version, hash, effectiveFrom, paramsJSON, nextAuthority string) (*PolicyVersion, error) {
	msp, err := callerMSP(ctx)
	if err != nil {
		return nil, err
	}

	// The authority permitted to anchor this version is the one designated by
	// the version currently in force; for the first version it comes from the
	// founding agreement. This makes the right to change policy auditable in
	// the same way the policy itself is.
	now0, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	existing, err := c.allPolicies(ctx)
	if err != nil {
		return nil, err
	}
	wantAuthority := foundingAuthority
	if cur := activeAt(existing, now0); cur != nil && strings.TrimSpace(cur.NextAuthority) != "" {
		wantAuthority = cur.NextAuthority
	}
	if msp != wantAuthority {
		return nil, fmt.Errorf("GOVERNANCE REJECTION [change control]: AnchorPolicy is restricted to the authority designated for the next version (%s); caller is %s", wantAuthority, msp)
	}
	if strings.TrimSpace(nextAuthority) == "" {
		return nil, fmt.Errorf("REJECTED [schema]: a policy version must designate the authority permitted to anchor its successor")
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

	var params PolicyParams
	if err := json.Unmarshal([]byte(paramsJSON), &params); err != nil {
		return nil, fmt.Errorf("REJECTED [schema]: policy parameters are not valid JSON: %v", err)
	}
	if params.QuantityTolerance < 0 {
		return nil, fmt.Errorf("REJECTED [schema]: quantityTolerance must be >= 0, got %.4f", params.QuantityTolerance)
	}

	now, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	if ef.Before(now) {
		return nil, fmt.Errorf("GOVERNANCE REJECTION [retroactivity]: effectiveFrom %s precedes the anchoring time %s; a policy version may not be declared in force before it was anchored", ef.UTC().Format(time.RFC3339), now.Format(time.RFC3339))
	}

	pols := existing
	for _, p := range pols {
		if p.Version == version {
			return nil, fmt.Errorf("REJECTED [duplicate]: policy version %q is already anchored", version)
		}
		pef, _ := time.Parse(time.RFC3339, p.EffectiveFrom)
		if !ef.After(pef) {
			return nil, fmt.Errorf("GOVERNANCE REJECTION [ordering]: effectiveFrom %s must be strictly after existing version %s (%s); policy supersession is prospective", effectiveFrom, p.Version, p.EffectiveFrom)
		}
	}

	pv := PolicyVersion{
		Version:       version,
		Hash:          hash,
		HashAlgorithm: hashAlgorithm,
		Canonical:     canonicalForm,
		EffectiveFrom: ef.UTC().Format(time.RFC3339),
		Params:        params,
		NextAuthority: strings.TrimSpace(nextAuthority),
		AnchoredBy:    msp,
		AnchoredAt:    now.Format(time.RFC3339),
	}
	if err := c.putJSON(ctx, objPolicy, version, pv); err != nil {
		return nil, err
	}
	return &pv, nil
}

// GetActivePolicy resolves active(t). Empty atTime means the transaction time.
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

// PolicyHistory returns all anchored versions ordered by effectiveFrom.
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
// governed evidence admission — §3.6 invariants under §5.1 binding
// ---------------------------------------------------------------------------

// CreateHeader validates and anchors one evidence header.
//
// Order of evaluation: schema, duplicate, predecessors, governance resolution,
// then the event-type invariants under the resolved policy parameters, then
// binding and persistence. Governance is resolved BEFORE the invariants
// because the parameters those invariants apply are properties of the active
// policy, not of the submission.
func (c *EvidenceContract) CreateHeader(ctx contractapi.TransactionContextInterface, headerJSON string) (*EvidenceHeader, error) {
	var h EvidenceHeader
	if err := json.Unmarshal([]byte(headerJSON), &h); err != nil {
		return nil, fmt.Errorf("REJECTED [schema]: header is not valid JSON: %v", err)
	}
	if h.PredecessorIDs == nil {
		h.PredecessorIDs = []string{}
	}

	// --- schema ---
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
	if !validTypes[h.EventType] {
		return nil, fmt.Errorf("REJECTED [schema]: eventType %q is not one of Create|Transform|Transfer|Verify|Recall", h.EventType)
	}
	if _, err := time.Parse(time.RFC3339, h.Timestamp); err != nil {
		return nil, fmt.Errorf("REJECTED [schema]: timestamp must be RFC3339, got %q", h.Timestamp)
	}

	// --- verification integrity: the attestation digest must be well formed ---
	h.PayloadHash = strings.ToLower(strings.TrimSpace(h.PayloadHash))
	if !hashRe.MatchString(h.PayloadHash) {
		if h.EventType == "Verify" {
			return nil, fmt.Errorf("INVARIANT VIOLATION [verification integrity]: a Verify event must reference a well-formed attestation payload digest; got %q", h.PayloadHash)
		}
		return nil, fmt.Errorf("REJECTED [schema]: payloadHash must be a 64-character SHA-256 hex digest, got %q", h.PayloadHash)
	}

	// --- duplicate: anchored headers are immutable, so re-anchoring is refused ---
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

	// --- totality: no governance state, no admission ---
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
	pp := act.Params

	// --- membership: governance decides who may submit ---
	if pp.EnforceMembership {
		var mem Membership
		found, err := c.getJSON(ctx, objMember, h.ActorOrg, &mem)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("GOVERNANCE REJECTION [membership]: organization %q is not a recognised consortium member and may not submit evidence", h.ActorOrg)
		}
		if mem.Status != "active" {
			return nil, fmt.Errorf("GOVERNANCE REJECTION [membership]: organization %q is %s and may not submit evidence", h.ActorOrg, mem.Status)
		}
	}

	// --- emergency overrides: a time-bounded suspension of admissibility ---
	if em, err := c.activeEmergencyFor(ctx, &h, now); err != nil {
		return nil, err
	} else if em != nil {
		return nil, fmt.Errorf("GOVERNANCE REJECTION [emergency]: submission is suspended by emergency %s (%s %q) until %s", em.EmergencyID, em.ScopeType, em.ScopeValue, em.Until)
	}

	// --- event-time divergence, where the policy sets a limit ---
	if pp.MaxEventTimeDivergenceHours > 0 {
		et, perr := time.Parse(time.RFC3339, h.Timestamp)
		if perr == nil {
			gap := now.Sub(et)
			if gap < 0 {
				gap = -gap
			}
			if gap > time.Duration(pp.MaxEventTimeDivergenceHours)*time.Hour {
				return nil, fmt.Errorf("GOVERNANCE REJECTION [event time divergence]: operational event time %s differs from submission time %s by more than the %d hours permitted by policy %s", h.Timestamp, now.Format(time.RFC3339), pp.MaxEventTimeDivergenceHours, act.Version)
			}
		}
	}

	// --- event-type invariants, evaluated under the resolved policy ---
	newAssets := map[string]AssetState{}
	touched := map[string]*AssetState{}
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
		if h.Quantity == nil {
			return nil, fmt.Errorf("REJECTED [schema]: Create requires a quantity declaration so that later transformations can be checked for conservation")
		}
		if h.Quantity.Value <= 0 {
			return nil, fmt.Errorf("REJECTED [schema]: Create quantity must be greater than zero, got %.4f", h.Quantity.Value)
		}
		if strings.TrimSpace(h.Quantity.Unit) == "" {
			return nil, fmt.Errorf("REJECTED [schema]: Create quantity requires a unit")
		}
		newAssets[h.AssetID] = AssetState{
			AssetID: h.AssetID, CurrentCustodian: h.ActorOrg,
			Quantity: h.Quantity.Value, Unit: strings.TrimSpace(h.Quantity.Unit),
		}

	case "Transform":
		if h.Transform == nil || len(h.Transform.Inputs) == 0 || len(h.Transform.Outputs) == 0 {
			return nil, fmt.Errorf("REJECTED [quantity conservation]: Transform requires a manifest with at least one input and one output")
		}
		unit := strings.TrimSpace(h.Transform.Unit)
		if unit == "" {
			return nil, fmt.Errorf("REJECTED [schema]: Transform manifest requires a unit")
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
			if pp.RecallBlocksTransform && a.Recalled {
				return nil, fmt.Errorf("INVARIANT VIOLATION [recall lock]: asset %q is under recall and may not be an input to a transformation until cleared", in.AssetID)
			}
			if a.Consumed {
				return nil, fmt.Errorf("REJECTED [asset]: input asset %q has been fully consumed by an earlier transformation", in.AssetID)
			}
			if a.Unit != unit {
				return nil, fmt.Errorf("INVARIANT VIOLATION [quantity conservation]: input asset %q is recorded in %q but the manifest declares %q; quantities in different units cannot be balanced", in.AssetID, a.Unit, unit)
			}
			if in.Quantity <= 0 {
				return nil, fmt.Errorf("REJECTED [schema]: input quantity for %q must be greater than zero", in.AssetID)
			}
			if in.Quantity > a.Quantity+qtyEpsilon {
				return nil, fmt.Errorf("INVARIANT VIOLATION [quantity conservation]: transformation consumes %.4f %s of asset %q but only %.4f %s remains", in.Quantity, unit, in.AssetID, a.Quantity, unit)
			}
			sumIn += in.Quantity
		}

		assetInOutputs := false
		for _, out := range h.Transform.Outputs {
			if _, found, err := loadAsset(out.AssetID); err != nil {
				return nil, err
			} else if found {
				return nil, fmt.Errorf("REJECTED [asset]: Transform output %q already exists; outputs must be new lots", out.AssetID)
			}
			if out.Quantity <= 0 {
				return nil, fmt.Errorf("REJECTED [schema]: output quantity for %q must be greater than zero", out.AssetID)
			}
			if out.AssetID == h.AssetID {
				assetInOutputs = true
			}
			sumOut += out.Quantity
			newAssets[out.AssetID] = AssetState{
				AssetID: out.AssetID, CurrentCustodian: h.ActorOrg,
				Quantity: out.Quantity, Unit: unit,
			}
		}
		if !assetInOutputs {
			return nil, fmt.Errorf("REJECTED [schema]: header assetID %q must appear among the transform outputs", h.AssetID)
		}

		// The tolerance is a governance parameter, not a submission parameter.
		allowed := pp.QuantityTolerance
		if diff := math.Abs(sumIn - sumOut); diff > allowed+qtyEpsilon {
			return nil, fmt.Errorf("INVARIANT VIOLATION [quantity conservation]: inputs total %.4f %s, outputs total %.4f %s, difference %.4f exceeds the tolerance %.4f set by policy %s", sumIn, unit, sumOut, unit, diff, allowed, act.Version)
		}

		// consume the declared input quantities
		for _, in := range h.Transform.Inputs {
			a := touched[in.AssetID]
			a.Quantity -= in.Quantity
			if a.Quantity <= qtyEpsilon {
				a.Quantity = 0
				a.Consumed = true
			}
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
		if a.Consumed {
			return nil, fmt.Errorf("REJECTED [asset]: asset %q has been fully consumed by a transformation and can no longer be transferred", h.AssetID)
		}
		if a.CurrentCustodian != h.ActorOrg {
			return nil, fmt.Errorf("INVARIANT VIOLATION [custody continuity]: Transfer of asset %q submitted by %q, but current custodian is %q; only the current custodian may record a transfer", h.AssetID, h.ActorOrg, a.CurrentCustodian)
		}
		if strings.TrimSpace(h.NewCustodian) == "" {
			return nil, fmt.Errorf("REJECTED [schema]: Transfer requires field \"newCustodian\"")
		}
		if h.NewCustodian == h.ActorOrg {
			return nil, fmt.Errorf("REJECTED [schema]: Transfer must name a receiving custodian different from the submitting custodian %q", h.ActorOrg)
		}
		a.CurrentCustodian = h.NewCustodian

	case "Verify":
		a, found, err := loadAsset(h.AssetID)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", h.AssetID)
		}
		if pp.VerifyRequiresDistinctActor && a.CurrentCustodian == h.ActorOrg {
			return nil, fmt.Errorf("INVARIANT VIOLATION [verification integrity]: policy %s requires an attestation from a party other than the current custodian, but %q holds custody of asset %q", act.Version, h.ActorOrg, h.AssetID)
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

	// --- binding: the resolved policy hash replaces anything client-supplied ---
	h.PolicyHash = act.Hash
	h.PolicyVersion = act.Version
	h.BoundAt = now.Format(time.RFC3339)

	if strings.TrimSpace(h.ActorSignature) == "" {
		msp, _ := callerMSP(ctx)
		id, _ := ctx.GetClientIdentity().GetID()
		h.ActorSignature = fmt.Sprintf("fabric-msp:%s;id:%s", msp, id)
	}

	// --- persist ---
	if err := c.putJSON(ctx, objEvent, h.EventID, h); err != nil {
		return nil, err
	}
	for id, a := range newAssets {
		st := a
		st.EventIDs = append(st.EventIDs, h.EventID)
		if err := c.putJSON(ctx, objAsset, id, st); err != nil {
			return nil, err
		}
	}
	if h.EventType == "Transform" {
		for _, in := range h.Transform.Inputs {
			if a, ok := touched[in.AssetID]; ok {
				a.EventIDs = append(a.EventIDs, h.EventID)
			}
		}
	}
	for id, a := range touched {
		if _, isNew := newAssets[id]; isNew {
			continue
		}
		if h.EventType != "Transform" && id == h.AssetID {
			a.EventIDs = append(a.EventIDs, h.EventID)
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
// recall clearance — makes "until cleared" (§3.6) an operation, not a phrase
// ---------------------------------------------------------------------------

// ClearRecall lifts the recall lock on an asset. It is a governance act, not an
// evidence event, so it is restricted to the consortium-admin identity and
// recorded as a clearance object bound to the policy in force at the time.
func (c *EvidenceContract) ClearRecall(ctx contractapi.TransactionContextInterface, assetID, reason string) (*RecallClearance, error) {
	now, act, err := c.governedNow(ctx)
	if err != nil {
		return nil, err
	}
	msp, err := c.requireAdmin(ctx, act, "ClearRecall")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("REJECTED [schema]: a clearance reason is required")
	}

	var a AssetState
	found, err := c.getJSON(ctx, objAsset, assetID, &a)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", assetID)
	}
	if !a.Recalled {
		return nil, fmt.Errorf("REJECTED [asset]: asset %q is not under recall", assetID)
	}

	a.Recalled = false
	if err := c.putJSON(ctx, objAsset, assetID, a); err != nil {
		return nil, err
	}
	cl := RecallClearance{
		AssetID: assetID, Reason: reason, ClearedBy: msp,
		ClearedAt: now.Format(time.RFC3339),
		PolicyVersion: act.Version, PolicyHash: act.Hash,
	}
	if err := c.putJSON(ctx, objClearance, assetID, cl); err != nil {
		return nil, err
	}
	return &cl, nil
}

// GetRecallStatus reports the lock state and any clearance on record.
func (c *EvidenceContract) GetRecallStatus(ctx contractapi.TransactionContextInterface, assetID string) (*RecallStatus, error) {
	var a AssetState
	found, err := c.getJSON(ctx, objAsset, assetID, &a)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", assetID)
	}
	st := &RecallStatus{AssetID: assetID, Recalled: a.Recalled}
	var cl RecallClearance
	if ok, err := c.getJSON(ctx, objClearance, assetID, &cl); err == nil && ok {
		st.Clearance = &cl
	}
	return st, nil
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

// GetAssetState returns custody, quantity and recall status for one asset.
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

// collect walks the lineage DAG connected to an asset, backward over
// predecessor links and forward over the successor index.
func (c *EvidenceContract) collect(ctx contractapi.TransactionContextInterface, assetID string) (map[string]*EvidenceHeader, map[string]LineageEdge, error) {
	var asset AssetState
	found, err := c.getJSON(ctx, objAsset, assetID, &asset)
	if err != nil {
		return nil, nil, err
	}
	if !found {
		return nil, nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", assetID)
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
			return nil, nil, err
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
	return visited, edges, nil
}

// orderedNodes returns the collected headers sorted by operational time.
func orderedNodes(visited map[string]*EvidenceHeader) []*EvidenceHeader {
	out := make([]*EvidenceHeader, 0, len(visited))
	for _, h := range visited {
		out = append(out, h)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Timestamp == out[j].Timestamp {
			return out[i].EventID < out[j].EventID
		}
		return out[i].Timestamp < out[j].Timestamp
	})
	return out
}

// GetLineageByAsset reconstructs the full lineage DAG connected to an asset.
func (c *EvidenceContract) GetLineageByAsset(ctx contractapi.TransactionContextInterface, assetID string) (*LineageGraph, error) {
	visited, edges, err := c.collect(ctx, assetID)
	if err != nil {
		return nil, err
	}
	g := &LineageGraph{
		AssetID:       assetID,
		Nodes:         []LineageNode{},
		Edges:         []LineageEdge{},
		OriginCreates: []string{},
	}
	for _, h := range orderedNodes(visited) {
		g.Nodes = append(g.Nodes, LineageNode{
			EventID: h.EventID, EventType: h.EventType, AssetID: h.AssetID,
			ActorOrg: h.ActorOrg, Timestamp: h.Timestamp, PolicyVersion: h.PolicyVersion,
		})
		if h.EventType == "Create" {
			g.OriginCreates = append(g.OriginCreates, h.EventID)
		}
	}
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

// AffectedDescendants returns the lots derived from the queried asset — the
// forward trace a recall investigation needs in order to identify which other
// lots are implicated (conceptual model §3.8).
func (c *EvidenceContract) AffectedDescendants(ctx contractapi.TransactionContextInterface, assetID string) (*DescendantSet, error) {
	var asset AssetState
	found, err := c.getJSON(ctx, objAsset, assetID, &asset)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [asset]: asset %q does not exist", assetID)
	}

	assets := map[string]bool{}
	via := map[string]bool{}
	seen := map[string]bool{}
	queue := append([]string{}, asset.EventIDs...)

	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if seen[id] {
			continue
		}
		seen[id] = true
		var h EvidenceHeader
		if ok, err := c.getJSON(ctx, objEvent, id, &h); err != nil {
			return nil, err
		} else if !ok {
			continue
		}
		// a Transform consuming this asset produces derived lots
		if h.EventType == "Transform" && h.Transform != nil {
			consumesQueried := false
			for _, in := range h.Transform.Inputs {
				if in.AssetID == assetID || assets[in.AssetID] {
					consumesQueried = true
				}
			}
			if consumesQueried {
				via[h.EventID] = true
				for _, out := range h.Transform.Outputs {
					if out.AssetID != assetID {
						assets[out.AssetID] = true
					}
				}
			}
		}
		var succ []string
		if ok, err := c.getJSON(ctx, objSucc, id, &succ); err == nil && ok {
			queue = append(queue, succ...)
		}
	}

	out := &DescendantSet{AssetID: assetID, Descendants: []string{}, ViaEvents: []string{}}
	for a := range assets {
		out.Descendants = append(out.Descendants, a)
	}
	for e := range via {
		out.ViaEvents = append(out.ViaEvents, e)
	}
	sort.Strings(out.Descendants)
	sort.Strings(out.ViaEvents)
	out.Count = len(out.Descendants)
	return out, nil
}

// GetTraceMetrics computes the lineage-derived indicators of the conceptual
// model §3.7.
//
// The model counts audit hand-offs along the MINIMAL EVIDENCE PATH, so the
// path is reconstructed as an actual walk through the lineage graph: the
// shortest chain of predecessor links joining the queried event to a Create,
// with the earliest Create preferred when several are equidistant. Reporting
// the full set of connected events in time order would be wrong wherever a
// transformation joins two inputs, because that set contains parallel
// branches and is not a path at all.
//
// For an asset-scoped query the queried event is taken to be the most recent
// event on the lineage; the selection rule is reported alongside the values so
// the figure cannot be read as something the caller chose.
//
// Dispute cycle time is reported as not instrumented rather than omitted,
// because the dispute governance domain is out of scope.
func (c *EvidenceContract) GetTraceMetrics(ctx contractapi.TransactionContextInterface, assetID string) (*TraceMetrics, error) {
	visited, _, err := c.collect(ctx, assetID)
	if err != nil {
		return nil, err
	}
	nodes := orderedNodes(visited)
	m := &TraceMetrics{
		AssetID:              assetID,
		PathEvents:           []string{},
		PathOrganizations:    []string{},
		QueriedEventRule:     "most recent event on the lineage of the queried asset",
		PathRule:             "shortest predecessor chain from the queried event to a Create; earliest Create preferred among equals",
		DisputeCycleSeconds:  -1,
		DisputeCycleReported: false,
	}
	if len(nodes) == 0 {
		return m, nil
	}

	queried := nodes[len(nodes)-1]
	m.QueriedEvent = queried.EventID
	m.QueriedEventTime = queried.Timestamp

	// Breadth-first walk backwards over predecessor links. The first level at
	// which a Create appears is the shortest distance to origin; among the
	// Creates found at that level the earliest is chosen.
	type step struct {
		id   string
		path []string
	}
	level := []step{{id: queried.EventID, path: []string{queried.EventID}}}
	seen := map[string]bool{queried.EventID: true}
	var best []string

	for len(level) > 0 && best == nil {
		var found []step
		var next []step
		for _, cur := range level {
			h := visited[cur.id]
			if h == nil {
				continue
			}
			if h.EventType == "Create" {
				found = append(found, cur)
				continue
			}
			for _, p := range h.PredecessorIDs {
				if seen[p] || visited[p] == nil {
					continue
				}
				seen[p] = true
				np := append(append([]string{}, cur.path...), p)
				next = append(next, step{id: p, path: np})
			}
		}
		if len(found) > 0 {
			sort.Slice(found, func(i, j int) bool {
				hi, hj := visited[found[i].id], visited[found[j].id]
				if hi.Timestamp == hj.Timestamp {
					return hi.EventID < hj.EventID
				}
				return hi.Timestamp < hj.Timestamp
			})
			best = found[0].path
			break
		}
		level = next
	}

	// The walk runs from the queried event back to origin; report it forwards.
	if best != nil {
		for i := len(best) - 1; i >= 0; i-- {
			h := visited[best[i]]
			m.PathEvents = append(m.PathEvents, h.EventID)
			m.PathOrganizations = append(m.PathOrganizations, h.ActorOrg)
		}
		origin := visited[best[len(best)-1]]
		m.EarliestCreate = origin.EventID
		m.EarliestCreateTime = origin.Timestamp
		t0, err0 := time.Parse(time.RFC3339, origin.Timestamp)
		t1, err1 := time.Parse(time.RFC3339, queried.Timestamp)
		if err0 == nil && err1 == nil {
			m.TimeToTraceSeconds = int64(t1.Sub(t0).Seconds())
		}
	}

	prevOrg := ""
	for _, org := range m.PathOrganizations {
		if prevOrg != "" && org != prevOrg {
			m.AuditHandoffs++
		}
		prevOrg = org
	}

	// §3.7 dispute cycle time: the interval between opening and resolution,
	// for disputes touching the evidence on this lineage. Reported only when a
	// dispute has actually been resolved, so the indicator is never inferred.
	ids := map[string]bool{}
	for id := range visited {
		ids[id] = true
	}
	disputes, err := c.disputesForEvents(ctx, ids)
	if err != nil {
		return nil, err
	}
	m.DisputesOnPath = []string{}
	var total int64
	var resolved int64
	for _, d := range disputes {
		m.DisputesOnPath = append(m.DisputesOnPath, d.DisputeID)
		if d.State == "resolved" && d.CycleSeconds >= 0 {
			total += d.CycleSeconds
			resolved++
		}
	}
	if resolved > 0 {
		m.DisputeCycleSeconds = total / resolved
		m.DisputeCycleReported = true
	}
	return m, nil
}
