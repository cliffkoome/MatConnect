# ADR-0005: Neon Auth owns identity, the app owns roles

- **Status:** Accepted

## Context

The first version stored password hashes and issued its own JWTs. That meant owning password reset, email verification, OAuth and session revocation. Roles (Passenger, Admin, Matatu admin) and the blocked flag are application concepts that change at runtime and must take effect immediately.

## Decision

- **Neon Auth (Managed Better Auth)** owns users, passwords, sessions, Google sign-in, email verification and reset, stored in the `neon_auth` schema on the same Neon branch as the app data. A database branch therefore also branches its users, which keeps previews and developer branches self-contained.
- The app's `users` table owns **role, phone number and blocked flag**, linked by `auth_user_id`. Every API request reloads that row, so a role change or block applies on the next request rather than at token expiry.
- **Email decides role assignment**: an Admin can add someone by email before they sign up, and that row is linked on the first *verified* sign-in. Verification is therefore mandatory.
- **Bootstrap:** the first user on an empty database becomes the Admin. Provisioning takes a transaction-scoped advisory lock (`pg_advisory_xact_lock`) before counting users. Without it, two people signing in to a fresh deployment at the same moment would both see zero users under READ COMMITTED and both become Admin. Transaction-scoped locks work through the pooler, unlike session locks (see [ADR-0002](0002-eta-cycle-as-a-leased-job.md)).

## Consequences

- **+** No credential storage in the app. Sessions are httpOnly cookies through a same-origin proxy, with no tokens in `localStorage`.
- **+** Authorisation always reflects the current database state.
- **−** One extra primary-key lookup per API request. That is negligible next to the request itself, and it is what makes revocation immediate.
- **−** Identity is tied to Neon. The link is a single column, so moving to another provider means re-linking by verified email, not migrating password hashes.
