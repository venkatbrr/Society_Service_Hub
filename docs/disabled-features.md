# Disabled Features Log

This document tracks features that have been intentionally disabled or simplified in the Society Service Hub to streamline development, testing, or initial user onboarding.

---

## 🚫 Authentication & Security

### 1. Email Verification
- **Status**: Disabled / Simplified.
- **Details**: New users are not required to verify their email address before accessing the application. 
- **Requirement**: The "Confirm email" toggle must be set to **OFF** in the Supabase Authentication Dashboard settings for this to take effect.
- **Reasoning**: To reduce friction during initial pilot testing and community recruitment.

### 2. Password Strength Constraints
- **Status**: Removed.
- **Details**: Standard password complexity requirements (e.g., minimum symbols, uppercase letters) are not enforced at the application level during signup.
- **Reasoning**: To simplify the user onboarding process during early-stage development and testing.

---

## 🏗️ Future Re-enablement Plan
When the app transitions to a formal production release:
1.  **Email Verification**: Re-enable "Confirm email" in Supabase and update `app/login.tsx` to handle the verification phase.
2.  **Security Audit**: Re-introduce password strength validation in `validateForm()` within `app/login.tsx` and `resetPassword` flows.
