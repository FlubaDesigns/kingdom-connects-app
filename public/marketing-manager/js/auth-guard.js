/**
 * Marketing Manager Authentication Guard
 * Points to centralized access control
 */
import { requireAuth } from "../../js/auth/access-control.js";

export function requireMarketingManager(onSuccess) {
  requireAuth({ roles: ['marketing_manager'] }, onSuccess);
}

export { requireAuth };
