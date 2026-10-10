/* Kingdom Connects - Marketing Manager Documentation */
import { requireAuth } from "../../js/auth/access-control.js";

requireAuth({ roles: ['marketing_manager', 'admin'] }, () => {
  console.log('Documentation page loaded');
});
