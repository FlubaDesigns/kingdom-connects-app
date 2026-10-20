# Replit dependency retirement — 2026-10-20

Removed the obsolete Python/Express application launchers; Firebase Hosting rewrites and functions/ remain authoritative. Removed the retired Replit CORS origin and platform-specific upload advice.

Google Maps previously requested a nonexistent /__replit_secrets endpoint. It now accepts a restricted, public Maps browser key from the page metadata google-maps-api-key. No browser key is configured by this cleanup; existing unavailable-map behavior remains until a valid browser key is supplied. The server-only Maps Embed key is not repurposed or exposed. This source edit does not certify live Google Maps functionality.

No customer records, cloud resources, credentials or accounts are deleted. The active source branch remains the one selected by the existing Authorization Engine release descriptor.
