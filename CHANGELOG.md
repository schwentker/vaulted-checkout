# Contract changelog

- 2026-10-24 phase 2 (Codex, GPT-6.1 Sol requested, high): contracts v1.1. Reject malformed intents and uint256 overflow; forbid future valid_after windows. A retry rejection cannot erase prior signing uncertainty. Reconcile expiry against a finalized block and require matching chain evidence. Specify persistent merchant claims, cross-order replay prevention, CAS work ownership, restart recovery, and permanent settled-order attempt lock. Clarify buyer-side spend-service precedence and POST payment challenge. Golden fixture regenerated with additional negatives; happy-path wire bytes unchanged. Claude must review these changes in phase 3.

- 2026-10-24 phase 1 (Claude, Opus 5.5 high): contracts v1 created. Decision module moved to buyer-side spend-service (see SPEC.md); awaiting Codex review.
