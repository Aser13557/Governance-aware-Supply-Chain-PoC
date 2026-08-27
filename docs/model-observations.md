# Model-level observations surfaced by implementation

Points where building the artifact revealed something under-specified in the
conceptual model [1] or the reference architecture [2]. None is a prototype
defect: in each case the prototype follows the source specification, and the
observation is a candidate refinement rather than a correction.

These belong in the paper's discussion. An implementation that only confirms
its specification has demonstrated feasibility; one that also identifies where
the specification is silent has done something the analytical papers could not.

---

## 1. Transformations are not guarded by custody

**Model.** §3.6 defines custody continuity as "only the current custodian may
record a transfer". The constraint is scoped to the Transfer verb.

**Consequence in the artifact.** Once quantities are tracked and consumed, a
Transform reduces the remaining quantity of its input lots. Nothing requires
the submitting party to hold those lots. A party unrelated to a lot may
therefore consume its quantity, provided the manifest balances and the units
agree — which the prototype permits, because the model does.

**Where the model shows it.** The canonical walkthrough in Table 2 has the
producer create Lots A and B and the processor transform them, with no
Transfer recorded between the two. Either the walkthrough omits a custody
handover that should be there, or transformation is deliberately outside
custody control. The text does not say which.

**Candidate refinements.** Require an explicit Transfer before a Transform
submitted by a party other than the current custodian; or extend custody
continuity to name transformation alongside transfer. The first keeps the
invariant set unchanged and makes the omission in Table 2 explicit; the second
changes the invariant.

---

## 2. Quantity conservation is unenforceable where the model places quantities

**Model.** §3.6 requires a transformation to balance inputs and outputs within
tolerance. The worked example places the quantities in the transformation's
off-ledger payload (the production order).

**Consequence.** A validating peer cannot evaluate the invariant without
reading the payload, which would defeat the minimal-disclosure property the
model is built around. The prototype therefore carries a compact quantity
manifest in the header — the minimum needed to check the balance, with the
production order itself remaining off-ledger.

**Observation.** The invariant and the disclosure boundary are in tension as
stated. Resolving it requires deciding which quantitative facts are shared
evidence rather than confidential content.

---

## 3. The conservation tolerance has no stated owner

**Model.** §3.6 refers to balancing "within tolerance" without saying who sets
the tolerance.

**Consequence.** If the submitting party declares it, the invariant is not a
constraint: a submitter can widen the tolerance until any imbalance passes.
The prototype resolves the tolerance from the active governance policy, which
also satisfies the architecture's requirement that a governance reference
change validation behaviour for new submissions.

**Observation.** Every validation parameter needs a stated owner. Silence
defaults to the submitter, which is the one party with an interest in the
answer.

---

## 4. "Until cleared" has no clearing operation

**Model.** §3.6 states that a recalled item cannot be transferred "until
cleared". No event type clears a recall, and the five-verb vocabulary has no
room for one.

**Consequence.** The prototype records clearance as a governance object rather
than an evidence event, restricted to the consortium administrator and bound to
the policy in force. This keeps the vocabulary intact while making the
condition an operation rather than a phrase.

**Observation.** The governance kit (§3.5) is the natural home for lifting a
lock, but the model does not connect the two.

---

## 5. Dispute cycle time cannot be instrumented from the event vocabulary

**Model.** §3.7 defines three indicators, the third being the interval between
a dispute being opened and resolved.

**Consequence.** Opening and resolving a dispute are not expressible in the
five-verb vocabulary, so the indicator has no data to compute from. The
prototype reports it explicitly as not instrumented rather than omitting it.

**Observation.** Two of the three indicators are derivable from lineage; the
third presupposes a governance domain the event model does not represent.

---

## 6. The passport asks for a field the header cannot carry

**Model.** §3.8 lists "recent location" among the passport contents.

**Consequence.** Location is not among the ten header fields, and the
prototype's passport reports the last recorded transfer and current custodian
instead — the nearest available proxy.

**Observation.** Either location belongs in the header, or the passport should
be specified in terms of custody rather than geography.
