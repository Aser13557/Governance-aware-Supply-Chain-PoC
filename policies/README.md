# policies

The governance artifacts whose hashes are anchored in the registry.

Each carries a machine-readable parameter block. Because the block is part of
the artifact, the anchored hash covers it, so an auditor can confirm that the
validation parameters held in the registry are the parameters the policy text
states. The parameters are what make a policy change alter validation
behaviour rather than merely being recorded.

| File | Version | Tolerance | Distinct attestor | Role in the run |
|---|---|---|---|---|
| `policy_v1.md` | v1.0 | 0.5 | no | in force for the first records |
| `policy_v2.md` | v2.0 | 0.25 | yes | supersedes v1.0 mid-run |
| `policy_v3_scheduled.md` | v3.0 | 0.10 | yes | anchored for a future date; never takes effect during a run |
