# Business follow-up candidate

Dave authorized pre-beta fixes directly on Main through the existing Authorization Engine.

## Acceptance

- Stripe lifecycle reconciles the current subscription state to each matching business. Cancel-at-period-end retains access while active; canceled, unpaid, paused and past-due states revoke paid Pro. Explicit promotional grants stay independent. Old events/checkouts cannot undo newer state or approval/suspension.
- Signup must atomically create a matching private owner and a pending free public listing. Owners may change only profile fields, never ratings, statistics, billing, identity or authority. Pending owners can edit their profile and reach checkout.
- Media checks live owner, account, church and business Pro authority. Storage quota reservations enforce ten photos and three combined video uploads/links. Failed uploads release reservations. Removed stored media releases quota; saved paths reload for deletion.
- Stats uses approved reviews and canonical profile fields. Counters are written by the authenticated backend with one-minute per-account/event deduplication. The UI explicitly describes signed-in activity, not all visitors; failures are unavailable, never invented zeroes.
- Verification uses existing Main access and disposable accounts/records, with cleanup. No new browser credentials or permissions are required.

## Evidence and limits

- 27 focused business/hierarchy tests passed before final refinements. Exact-candidate full suite and security gates are required in the Authorization Engine.
- Stripe account setup remains Dave's existing deferred task. Real charging, refunds and checkout completion with a payment method are not performed by this batch. Subscription reconciliation is tested with synthetic billing identities and isolated fixtures; it is not proof of an external Stripe payment.
- QR Gear store/cart/checkout remains a separate unfinished integration and is unchanged.
- No assistant-owned items were added to Dave's personal to-do list.
