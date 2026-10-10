/**
 * Admin Authentication Guard
 * Re-exports centralized access control for admin pages
 */

import { requireAdmin } from "../../js/auth/access-control.js";

export { requireAdmin };
