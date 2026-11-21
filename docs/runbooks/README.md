# Runbooks

Short, step-by-step guides for when something goes wrong in production (PRD §26.5).
Every service here is on a free plan; none of these steps costs money.

| Problem                                            | Runbook                                       |
| -------------------------------------------------- | --------------------------------------------- |
| A key or password leaked, or someone left the team | [Rotate a secret](rotate-a-secret.md)         |
| Data was deleted or damaged                        | [Restore from backup](restore-from-backup.md) |
| Reminders or emails stopped                        | [Stuck background jobs](stuck-jobs.md)        |
| A Razorpay payment did not change the plan         | [Replay a webhook](replay-webhook.md)         |
| The demo organization looks broken                 | [Reset the demo](reset-demo.md)               |
