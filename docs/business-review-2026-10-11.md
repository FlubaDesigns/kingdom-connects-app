# Business review — first candidate

This branch starts from the deployed church follow-up, dab4e94f35644904c5bca3fe5fe927bffcb9e917. It is a sandbox candidate, not a production release.

## Acceptance for this batch

- One explicit business context is used throughout the business portal; multiple businesses require a choice and a foreign ID is rejected. Platform administrators can select an existing business.
- Public listing identity, approval and Pro fields cannot be shadowed by private document fields.
- Pro content management uses the business entitlement. Paid listings also require the matching active/trialing subscription; platform grants remain independent. New listings cannot forge a grant or billing identity.
- Public product/service and testimonial reads require active content on a published Pro business under an active church; owners can manage drafts.
- The actual review reply button saves only response text/date. Ratings, moderation, reviewer identity and other businesses remain protected. Review lists request approved reviews.
- Business Insights supports an initial missing record, draft/save, and ownership boundaries. Questions use an audience query and local ordering without an extra composite index.
- Storefront presentation includes business identity/logo, primary contact actions, a contact/hours sidebar, responsive offering cards, and optional offering image/details URLs. Contact display settings are honored. This does not make contact fields private in the underlying public document.
- Owners can add/edit optional image and booking/details URLs. Unsafe URL schemes and markup are rejected/escaped.

## Evidence and limits

- Existing 45 tests plus the initial six business tests passed in Firestore/Storage emulators (51/51). Further focused tests cover selected context, the actual reply handler and paid-subscription boundaries; final exact-SHA results belong to the Authorization Engine PR.
- The production directory was inspected signed out and showed no businesses. No real published business or authenticated production save has been verified in this turn.
- The cloud browser cannot reach the local test server (connection refused). Desktop/mobile visual verification remains required on an authorized isolated preview, with representative business data.
- No production data, Stripe payment flow, or QR Gear checkout was changed.

## Remaining review work (assistant-owned)

- Verify storefront appearance and navigation on desktop/mobile, with and without photos, offerings and contact information. Exercise product creation/edit/save and questionnaire persistence through the deployed UI before claiming completion.
- Inspect real production business records after authorized sign-in to explain the empty public directory without changing approval or visibility blindly.
- Complete business billing lifecycle review: current Stripe subscription updates/cancellation update the user record but do not consistently revoke the public business Pro status. The paid editing safeguard in this batch does not repair stale public badges/media.
- Review business-media entitlement enforcement, profile field/schema hardening, signup/approval edge cases, and stats beyond the approved-review query repair.
- Continue the unfinished QR Gear storefront integration separately; image/details links are a showcase, not a completed shopping cart or checkout.

No assistant-owned item above belongs on Dave's personal admin to-do list. Existing owner DNS and deferred church Stripe items remain separate.

## Release path

Prepare a pinned source candidate in the Authorization Engine and run its candidate and full security gates. Do not merge or deploy until Dave explicitly authorizes release under AGENTS.md. A visual preview requires his request under the same protocol. After release, verify both the release marker and authenticated business behavior.
