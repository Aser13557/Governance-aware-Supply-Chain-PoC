package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// This file implements the governance domains the conceptual model names
// alongside change control: membership, disputes, emergencies and audit
// access. Each is a governance act rather than an evidence event, so none
// enters the five-verb vocabulary. Each is anchored with the policy version in
// force at the time of the act, and each carries only a digest of its detailed
// rationale, which remains off-ledger.

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

// governedNow resolves the policy in force and refuses the act if none is.
// A governance act that is not itself governed would be exactly the ambient
// administrative change the architecture exists to eliminate.
func (c *EvidenceContract) governedNow(ctx contractapi.TransactionContextInterface) (time.Time, *PolicyVersion, error) {
	now, err := txTime(ctx)
	if err != nil {
		return time.Time{}, nil, err
	}
	pols, err := c.allPolicies(ctx)
	if err != nil {
		return time.Time{}, nil, err
	}
	act := activeAt(pols, now)
	if act == nil {
		return time.Time{}, nil, fmt.Errorf("INVARIANT VIOLATION [totality]: no governance policy is active at %s; a governance act must itself be governed", now.Format(time.RFC3339))
	}
	return now, act, nil
}

// requireAdmin restricts an act to the identity the active policy designates.
func (c *EvidenceContract) requireAdmin(ctx contractapi.TransactionContextInterface, act *PolicyVersion, op string) (string, error) {
	msp, err := callerMSP(ctx)
	if err != nil {
		return "", err
	}
	want := act.NextAuthority
	if strings.TrimSpace(want) == "" {
		want = foundingAuthority
	}
	if msp != want {
		return "", fmt.Errorf("GOVERNANCE REJECTION [change control]: %s is restricted to the authority designated by policy %s (%s); caller is %s", op, act.Version, want, msp)
	}
	return msp, nil
}

func requireDigest(field, v string) error {
	v = strings.ToLower(strings.TrimSpace(v))
	if !hashRe.MatchString(v) {
		return fmt.Errorf("REJECTED [schema]: %s must be a 64-character SHA-256 digest of the off-ledger artifact, got %q", field, v)
	}
	return nil
}

// ---------------------------------------------------------------------------
// membership
// ---------------------------------------------------------------------------

func (c *EvidenceContract) setMembership(ctx contractapi.TransactionContextInterface, org, status, rationaleHash, op string) (*Membership, error) {
	org = strings.TrimSpace(org)
	if org == "" {
		return nil, fmt.Errorf("REJECTED [schema]: organization identifier is required")
	}
	if err := requireDigest("rationaleHash", rationaleHash); err != nil {
		return nil, err
	}
	now, act, err := c.governedNow(ctx)
	if err != nil {
		return nil, err
	}
	msp, err := c.requireAdmin(ctx, act, op)
	if err != nil {
		return nil, err
	}
	m := Membership{
		Org: org, Status: status,
		RationaleHash: strings.ToLower(strings.TrimSpace(rationaleHash)),
		ChangedBy:     msp, ChangedAt: now.Format(time.RFC3339),
		PolicyVersion: act.Version, PolicyHash: act.Hash,
	}
	if err := c.putJSON(ctx, objMember, org, m); err != nil {
		return nil, err
	}
	return &m, nil
}

// AdmitOrganization recognises an organization as a consortium member.
func (c *EvidenceContract) AdmitOrganization(ctx contractapi.TransactionContextInterface, org, rationaleHash string) (*Membership, error) {
	return c.setMembership(ctx, org, "active", rationaleHash, "AdmitOrganization")
}

// SuspendOrganization removes future submission rights. Evidence already
// anchored by the organization is untouched: suspension is prospective, in the
// same way that policy supersession is.
func (c *EvidenceContract) SuspendOrganization(ctx contractapi.TransactionContextInterface, org, rationaleHash string) (*Membership, error) {
	var cur Membership
	found, err := c.getJSON(ctx, objMember, org, &cur)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [membership]: organization %q is not a recognised member", org)
	}
	return c.setMembership(ctx, org, "suspended", rationaleHash, "SuspendOrganization")
}

// ReinstateOrganization restores submission rights to a suspended member.
func (c *EvidenceContract) ReinstateOrganization(ctx contractapi.TransactionContextInterface, org, rationaleHash string) (*Membership, error) {
	var cur Membership
	found, err := c.getJSON(ctx, objMember, org, &cur)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [membership]: organization %q is not a recognised member", org)
	}
	return c.setMembership(ctx, org, "active", rationaleHash, "ReinstateOrganization")
}

// GetMembership returns one organization's standing.
func (c *EvidenceContract) GetMembership(ctx contractapi.TransactionContextInterface, org string) (*Membership, error) {
	var m Membership
	found, err := c.getJSON(ctx, objMember, org, &m)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [membership]: organization %q is not a recognised member", org)
	}
	return &m, nil
}

// MembershipRegistry lists every organization on record.
func (c *EvidenceContract) MembershipRegistry(ctx contractapi.TransactionContextInterface) ([]Membership, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(objMember, []string{})
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := []Membership{}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		var m Membership
		if err := json.Unmarshal(kv.Value, &m); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Org < out[j].Org })
	return out, nil
}

// ---------------------------------------------------------------------------
// disputes
// ---------------------------------------------------------------------------

// OpenDispute registers a contested reading of anchored evidence. It does not
// alter or withdraw any header: the anchored record stands, and the dispute
// augments the context in which it is interpreted.
func (c *EvidenceContract) OpenDispute(ctx contractapi.TransactionContextInterface, disputeID, eventIDsCSV, rationaleHash string) (*Dispute, error) {
	disputeID = strings.TrimSpace(disputeID)
	if disputeID == "" {
		return nil, fmt.Errorf("REJECTED [schema]: dispute identifier is required")
	}
	if err := requireDigest("rationaleHash", rationaleHash); err != nil {
		return nil, err
	}
	var existing Dispute
	if found, err := c.getJSON(ctx, objDispute, disputeID, &existing); err != nil {
		return nil, err
	} else if found {
		return nil, fmt.Errorf("REJECTED [duplicate]: dispute %q is already registered", disputeID)
	}

	ids := []string{}
	for _, raw := range strings.Split(eventIDsCSV, ",") {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		var h EvidenceHeader
		found, err := c.getJSON(ctx, objEvent, id, &h)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("REJECTED [lineage]: disputed event %q is not anchored", id)
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("REJECTED [schema]: a dispute must name at least one anchored event")
	}

	now, act, err := c.governedNow(ctx)
	if err != nil {
		return nil, err
	}
	msp, err := callerMSP(ctx)
	if err != nil {
		return nil, err
	}
	d := Dispute{
		DisputeID: disputeID, EventIDs: ids, State: "open",
		OpenedBy: msp, OpenedAt: now.Format(time.RFC3339),
		RationaleHash: strings.ToLower(strings.TrimSpace(rationaleHash)),
		PolicyVersion: act.Version, PolicyHash: act.Hash,
		CycleSeconds: -1,
	}
	if err := c.putJSON(ctx, objDispute, disputeID, d); err != nil {
		return nil, err
	}
	return &d, nil
}

// ResolveDispute closes a dispute and records the interval it remained open,
// which is the third indicator of the conceptual model §3.7.
func (c *EvidenceContract) ResolveDispute(ctx contractapi.TransactionContextInterface, disputeID, outcome, resolutionHash string) (*Dispute, error) {
	var d Dispute
	found, err := c.getJSON(ctx, objDispute, disputeID, &d)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [dispute]: dispute %q is not registered", disputeID)
	}
	if d.State != "open" {
		return nil, fmt.Errorf("REJECTED [dispute]: dispute %q is already resolved", disputeID)
	}
	if strings.TrimSpace(outcome) == "" {
		return nil, fmt.Errorf("REJECTED [schema]: a resolution outcome is required")
	}
	if err := requireDigest("resolutionHash", resolutionHash); err != nil {
		return nil, err
	}
	now, act, err := c.governedNow(ctx)
	if err != nil {
		return nil, err
	}
	msp, err := c.requireAdmin(ctx, act, "ResolveDispute")
	if err != nil {
		return nil, err
	}
	opened, err := time.Parse(time.RFC3339, d.OpenedAt)
	if err != nil {
		return nil, err
	}
	d.State = "resolved"
	d.Outcome = outcome
	d.ResolutionHash = strings.ToLower(strings.TrimSpace(resolutionHash))
	d.ResolvedBy = msp
	d.ResolvedAt = now.Format(time.RFC3339)
	d.CycleSeconds = int64(now.Sub(opened).Seconds())
	if err := c.putJSON(ctx, objDispute, disputeID, d); err != nil {
		return nil, err
	}
	return &d, nil
}

// GetDispute returns one dispute.
func (c *EvidenceContract) GetDispute(ctx contractapi.TransactionContextInterface, disputeID string) (*Dispute, error) {
	var d Dispute
	found, err := c.getJSON(ctx, objDispute, disputeID, &d)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [dispute]: dispute %q is not registered", disputeID)
	}
	return &d, nil
}

// DisputeRegistry lists every dispute on record.
func (c *EvidenceContract) DisputeRegistry(ctx contractapi.TransactionContextInterface) ([]Dispute, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(objDispute, []string{})
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := []Dispute{}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		var d Dispute
		if err := json.Unmarshal(kv.Value, &d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].DisputeID < out[j].DisputeID })
	return out, nil
}

// DisputesForEvents returns the disputes touching any of the given events, so
// that export and query behaviour can take dispute state into account.
func (c *EvidenceContract) disputesForEvents(ctx contractapi.TransactionContextInterface, ids map[string]bool) ([]Dispute, error) {
	all, err := c.DisputeRegistry(ctx)
	if err != nil {
		return nil, err
	}
	out := []Dispute{}
	for _, d := range all {
		for _, e := range d.EventIDs {
			if ids[e] {
				out = append(out, d)
				break
			}
		}
	}
	return out, nil
}

// DisputesForAsset returns the disputes touching the lineage of an asset.
func (c *EvidenceContract) DisputesForAsset(ctx contractapi.TransactionContextInterface, assetID string) ([]Dispute, error) {
	visited, _, err := c.collect(ctx, assetID)
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	for id := range visited {
		ids[id] = true
	}
	return c.disputesForEvents(ctx, ids)
}

// ---------------------------------------------------------------------------
// emergency overrides
// ---------------------------------------------------------------------------

// DeclareEmergency suspends submissions matching a scope until a stated
// deadline. The override is time-bounded by construction and carries the
// digest of the governance decision that authorised it, so a temporary measure
// remains reviewable once normal policy resumes.
func (c *EvidenceContract) DeclareEmergency(ctx contractapi.TransactionContextInterface, emergencyID, scopeType, scopeValue, until, decisionHash string) (*Emergency, error) {
	emergencyID = strings.TrimSpace(emergencyID)
	if emergencyID == "" {
		return nil, fmt.Errorf("REJECTED [schema]: emergency identifier is required")
	}
	if scopeType != "eventType" && scopeType != "assetPrefix" {
		return nil, fmt.Errorf("REJECTED [schema]: scopeType must be eventType or assetPrefix, got %q", scopeType)
	}
	if strings.TrimSpace(scopeValue) == "" {
		return nil, fmt.Errorf("REJECTED [schema]: scopeValue is required")
	}
	if err := requireDigest("decisionHash", decisionHash); err != nil {
		return nil, err
	}
	now, act, err := c.governedNow(ctx)
	if err != nil {
		return nil, err
	}
	msp, err := c.requireAdmin(ctx, act, "DeclareEmergency")
	if err != nil {
		return nil, err
	}
	u, err := time.Parse(time.RFC3339, until)
	if err != nil {
		return nil, fmt.Errorf("REJECTED [schema]: until must be RFC3339, got %q", until)
	}
	if !u.After(now) {
		return nil, fmt.Errorf("GOVERNANCE REJECTION [emergency]: an override must be time-bounded into the future; until %s is not after %s", u.UTC().Format(time.RFC3339), now.Format(time.RFC3339))
	}
	var existing Emergency
	if found, err := c.getJSON(ctx, objEmergency, emergencyID, &existing); err != nil {
		return nil, err
	} else if found {
		return nil, fmt.Errorf("REJECTED [duplicate]: emergency %q is already declared", emergencyID)
	}
	e := Emergency{
		EmergencyID: emergencyID, ScopeType: scopeType, ScopeValue: strings.TrimSpace(scopeValue),
		Until: u.UTC().Format(time.RFC3339), DecisionHash: strings.ToLower(strings.TrimSpace(decisionHash)),
		State: "active", DeclaredBy: msp, DeclaredAt: now.Format(time.RFC3339),
		PolicyVersion: act.Version, PolicyHash: act.Hash,
	}
	if err := c.putJSON(ctx, objEmergency, emergencyID, e); err != nil {
		return nil, err
	}
	return &e, nil
}

// LiftEmergency ends an override before its deadline.
func (c *EvidenceContract) LiftEmergency(ctx contractapi.TransactionContextInterface, emergencyID string) (*Emergency, error) {
	var e Emergency
	found, err := c.getJSON(ctx, objEmergency, emergencyID, &e)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("REJECTED [emergency]: emergency %q is not declared", emergencyID)
	}
	now, act, err := c.governedNow(ctx)
	if err != nil {
		return nil, err
	}
	msp, err := c.requireAdmin(ctx, act, "LiftEmergency")
	if err != nil {
		return nil, err
	}
	_ = msp
	e.State = "lifted"
	e.LiftedAt = now.Format(time.RFC3339)
	if err := c.putJSON(ctx, objEmergency, emergencyID, e); err != nil {
		return nil, err
	}
	return &e, nil
}

// EmergencyRegistry lists every override on record, active or otherwise.
func (c *EvidenceContract) EmergencyRegistry(ctx contractapi.TransactionContextInterface) ([]Emergency, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(objEmergency, []string{})
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := []Emergency{}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		var e Emergency
		if err := json.Unmarshal(kv.Value, &e); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].EmergencyID < out[j].EmergencyID })
	return out, nil
}

// activeEmergencyFor returns the override blocking a submission, if any. An
// override that has passed its deadline no longer blocks, without needing an
// explicit lifting transaction.
func (c *EvidenceContract) activeEmergencyFor(ctx contractapi.TransactionContextInterface, h *EvidenceHeader, now time.Time) (*Emergency, error) {
	all, err := c.EmergencyRegistry(ctx)
	if err != nil {
		return nil, err
	}
	for i := range all {
		e := all[i]
		if e.State != "active" {
			continue
		}
		u, err := time.Parse(time.RFC3339, e.Until)
		if err != nil || !u.After(now) {
			continue
		}
		switch e.ScopeType {
		case "eventType":
			if h.EventType == e.ScopeValue {
				return &e, nil
			}
		case "assetPrefix":
			if strings.HasPrefix(h.AssetID, e.ScopeValue) {
				return &e, nil
			}
		}
	}
	return nil, nil
}
