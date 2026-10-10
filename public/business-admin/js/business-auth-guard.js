/**
 * Business Admin Authentication Guard
 * Now uses centralized access control
 */

import { requireBusinessOwner, requireAuth } from "../../js/auth/access-control.js";

export { requireBusinessOwner, requireAuth };

export function verifyBusinessOwnerAccess() {
  requireAuth({ requireBusiness: true }, () => {});
}
