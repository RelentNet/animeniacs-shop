# Logto first-run setup

Logto is running locally via Docker Compose on:

- `http://localhost:3004` — user-facing sign-in endpoint
- `http://localhost:3005` — admin console (interactive UI)

The Logto container reports healthy and `/api/.well-known/sign-in-exp`
returns `signInMode: "Register"`, which means the instance is in
first-run mode: no admin user exists yet.

**First-run admin creation is interactive-only by design.** There is
no public CLI for bootstrapping the very first admin account. The
Management API requires an existing M2M app to authenticate, which is
a chicken-and-egg situation on a fresh instance. So Phase 4's
`/admin/artists` admin-gated routes have their code in place but the
real login flow can't be verified until the steps below are completed
manually.

## What Phase 4 needs

For the `(admin)/layout.tsx` gate (Task B.1) to let you into
`/admin/artists`, three things must exist in Logto:

1. **An admin user** — your own account. You sign in as this when
   testing.
2. **A role named `admin`** — the gate checks
   `claims?.roles?.includes('admin')`.
3. **A Next.js app integration** — provides `LOGTO_APP_ID` and
   `LOGTO_APP_SECRET` for `.env.local`.

## Steps (do this when you're back)

### 1. Create the initial admin user

1. Open `http://localhost:3005` in a browser.
2. Logto's first-run wizard asks for a username + password. Pick
   something you'll remember; it becomes your Logto-admin account
   (separate from the `admin` role we'll create for this app).
3. Complete the rest of the welcome wizard (region, etc.) — accept
   defaults.

### 2. Create the Next.js app integration

1. In the Logto admin console, go to **Applications** → **Create
   application**.
2. Choose **Next.js (App Router)** as the framework. Logto's docs
   for this exact integration are good — follow them rather than
   any older Next.js guide.
3. Name it `Animeniacs Admin` (or whatever you want).
4. On the configuration screen, set:
   - **Redirect URIs**: `http://localhost:3000/api/logto/callback`
   - **Post sign-out redirect URIs**: `http://localhost:3000/`
   - **CORS allowed origins**: `http://localhost:3000`
5. Save. Copy the App ID and App Secret displayed. Add them to
   `.env.local`:

   ```
   LOGTO_APP_ID=<value from console>
   LOGTO_APP_SECRET=<value from console>
   ```

### 3. Create the `admin` role and assign yourself

1. **Roles** → **Create role** → name it exactly `admin` (lowercase,
   no spaces). Description: "Admin access to /admin/* routes."
2. **Users** → **Create user**. This is the application-side user
   you'll sign in as on `localhost:3000/sign-in`.
   - Username: anything memorable
   - Password: set one
3. After the user is created, go to its **Roles** tab and assign
   the `admin` role.

### 4. (Optional) M2M for future automation

If you want Phase 5+ to provision Logto from code (e.g., automated
user invites for new artists), create a Machine-to-Machine app and
share its credentials. Phase 4 doesn't need this.

### 5. Verify

1. Restart the Next.js dev server so it picks up the new env vars.
2. Hit `http://localhost:3000/admin/artists` in a fresh incognito
   window. You should be redirected to Logto's sign-in.
3. Sign in with the application-user credentials from step 3.2.
4. You should land back on `/admin/artists` and see the artist list
   (or an empty state with a `+ new artist` button).

## What was already done in code

The `(admin)/layout.tsx` gate (committed in Task B.1) imports from
`@logto/next/server-actions` and calls `getLogtoContext(logtoConfig)`,
following the existing design spec §10/§11 pattern. Unit tests with
mocked `getLogtoContext` cover the three branches:

- unauthenticated → redirect to `/sign-in`
- authenticated, no `admin` role → 403
- authenticated, has `admin` role → render children

So the gate logic is verified. Only the live Logto flow is pending
your manual setup above.
