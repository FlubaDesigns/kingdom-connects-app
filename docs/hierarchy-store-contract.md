# Kingdom Connects hierarchy and store foundation

This change is based on the source archive matching the sampled live Firebase frontend,
not the older GitHub frontend. Current member, church and business records are pre-beta
fixtures. No production data migration or deployment is performed by the tests.

## Identity and authority

| Group | Permanent ID | Authority |
| --- | --- | --- |
| Member | Firebase Auth UID / `users/{uid}` | Own profile; church decides membership |
| Business | Shared public/private business document ID | Owner edits content; controlling church and platform decide approval |
| Church | `churches/{id}` document ID | `admin_uid` edits church content; platform decides church status |

`church_id` is the single controlling business affiliation. A display name, email,
slug, home-church selection or dashboard preference never grants management rights.
One login may hold several roles without combining its member, business and church stores.

Business visibility requires both platform and church approval, an active controlling
church, and no suspension from either authority. Payment grants Pro entitlements; it
does not grant organizational approval. Unaffiliated businesses remain pending.
Church suspension pauses affiliated listings. Reactivation restores only otherwise
eligible businesses; a church cannot clear a platform suspension.

`POST /api/hierarchy` authenticates and transactionally checks every transition.
Business owners request affiliation or release. Church administrators review requests
for their own churches. Transfers require release followed by approval from the new church.
Member transfers reset membership approval according to the new church's automatic/manual
policy. The church member API returns a limited membership view, not private billing or roles.
Direct browser writes to roles, approval, affiliation and lifecycle fields are blocked.

## QR Gear staging

Stores remain disabled in `generateQrGearToken`. Do not enable them merely because the
church permission checkbox is checked. The helper sends only entity type and permanent ID;
the server resolves identity, verifies ownership and evaluates parent permissions.

The prepared contract is `entityType`, `entityId`, `storeOwner`, `storeId`, `channelId`,
`target`, `viewType`, `mode` and server-selected capabilities. The current staged token
has no creation/management powers. Member email and page slug are never store IDs.
The member URL points to its existing dashboard; a public member store route is not invented.
The obsolete Express store endpoint is retired to prevent a second authority path.

The available QR Gear source has different server/Firebase widget implementations.
Before activation, confirm its deployed receiver, token verification, store provisioning,
builder permissions and public storefront behavior for all three entity types.

## Verification and rollout

`npm test` starts Firestore and Storage emulators using only `demo-kingdom-hierarchy`.
`npm run test:policy` runs the dependency-free lifecycle/identity tests.
The emulator tests cover privilege escalation, direct-write restrictions, cross-church
access, transfer/release, publication, suspension, and upload ownership.

Deploy the backend and rules together with the frontend. The church status trigger retries
failed child synchronization; direct actions also await synchronization. Server-rendered
business profiles check the current parent state independently of the asynchronous trigger.
Storage rules use Firestore ownership checks; provision the Storage service's Firestore
access during deployment when Firebase requests it.

For existing fixtures, `node functions/migrate-hierarchy.js` is a dry run.
`--apply` normalizes compatible legacy affiliation fields without changing record IDs.
Conflicting affiliations and missing owner/church records are reported for explicit resolution.
No test records are deleted. The legacy seed workflow is manual to prevent a branch push
from changing Firebase data.
