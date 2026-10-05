# ID verification vendor scorecard (to be completed in sandbox trials)

Vendor capability claims below come from the founder's notes and vendor marketing pages. **None are verified yet.**
Every row must be confirmed in writing by the vendor or observed in the sandbox before it counts.

| Criterion | Smile ID | Didit | Sumsub |
|---|---|---|---|
| Kenyan National ID government-record check (source? IPRS?) | ? | ? | ? |
| Kenyan passport / alien ID / other documents | ? | ? | ? |
| Selfie, liveness, face match: measured pass rate on 30+ real Kenyan test cases | ? | ? | ? |
| Success rate on older or worn ID cards, low-end Android cameras, poor light | ? | ? | ? |
| Price per check, failed-check pricing, volume tiers, minimums (KES) | ? | ? | ? |
| Where data is processed and stored; retention; deletion on request | ? | ? | ? |
| Can we avoid storing images ourselves and keep only results? | ? | ? | ? |
| Kenya Data Protection Act position; data-processing agreement available | ? | ? | ? |
| Webhook signing, retries, event ids, replay protection | ? | ? | ? |
| Sandbox realism; test Kenyan identities available | ? | ? | ? |
| SDK/API fit: web, React Native/Expo, REST | ? | ? | ? |
| Manual-review fallback and appeal path | ? | ? | ? |
| SLA, uptime history, support response, local presence | ? | ? | ? |
| Exit terms and data export | ? | ? | ? |

## Questions for every vendor
1. Which government databases back the Kenyan ID check, and what happens when the source is down?
2. What is stored on your side, for how long, and in which country?
3. Will you sign a data-processing agreement, and do you support Kenya data-protection requirements?
4. What are the real all-in costs per completed verification, including retries?

## Decision rule
Choose only after counsel review, sandbox results on real test cases, and cost per *successfully verified* unit/user
(ADR-0006 target). Keep at least one alternative adapter buildable.
