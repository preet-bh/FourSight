# Task 3 report: Auth feature and protected role/session handling

Implemented the email/password auth service and reusable accessible auth panel in the Task 3 worktree.

## Behavior

- Signup trims and validates the display name and email, uses Supabase email/password signup, and sends only `display_name` in user metadata. It returns `confirmationRequired: true`; the panel tells the user to open the confirmation link before signing in. No OTP flow is used.
- Sign-in, session restoration, auth change observation, unsubscribe, and sign-out use Supabase Auth.
- Staff permissions come only from `profiles.role`. Unknown roles, profile query errors, and absent profiles resolve to `resident`. User metadata cannot grant a role.
- `AuthUser` contains no email. The public report contract omits `reporterId` and `hideReason`, and the community post/comment presentation contracts use author display names without email fields. The auth panel confines email to the account form.
- Added `AuthPanel.tsx` and scoped auth styles for app-shell composition; it provides sign-in, account creation, the check-your-email state, and signed-in account/sign-out presentation.

## Verification

- RED: `npm test -- src/features/auth/auth-service.test.ts` failed on the missing `./auth-service` module before implementation.
- GREEN: `npm test -- src/features/auth/auth-service.test.ts` — 6 tests passed.
- `npm test` — 3 test files passed, 13 tests passed.
- `npm run build` — TypeScript and Vite production build passed.

## Files

- `src/features/auth/AuthPanel.tsx`
- `src/features/auth/auth-service.ts`
- `src/features/auth/auth-service.test.ts`
- `src/features/auth/auth.css`
