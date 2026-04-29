# Disabled Features Log

This document tracks product behavior that is intentionally disabled, simplified, or removed from the active app.

---

## Authentication and Security

### 1. Email Verification

- **Status**: Disabled
- **Details**: New users are not blocked on email confirmation before using the app.
- **Operational requirement**: Supabase Auth "Confirm email" must remain OFF for this flow to work as implemented.
- **Reason**: Lower-friction onboarding during pilot usage.

### 2. Password Strength Constraints

- **Status**: Simplified
- **Details**: The sign-up flow does not enforce custom password-complexity rules beyond the basic form checks in the app and Supabase Auth requirements.
- **Reason**: Reduced friction during early adoption.

---

## Removed Product Area

### 3. Resident Marketplace

- **Status**: Removed from the shipped product
- **Details**: The former marketplace screens under `app/business/*` are not present in the app. Marketplace tables were removed in `supabase/migrations/20260422010000_simplify_roles_and_remove_marketplace.sql`. Provider `favorites` and `ratings` no longer support business targets.
- **Reason**: Scope was narrowed to provider discovery, service visits, funds, onboarding, and personal reminders.

---

## Notes for Reintroduction

If these areas are reintroduced later:

1. Email verification will require auth-flow updates in `app/login.tsx` and related messaging.
2. Password strength rules will require explicit validation logic in the sign-up form.
3. A marketplace return would require fresh schema, routes, components, and documentation rather than re-enabling hidden screens.