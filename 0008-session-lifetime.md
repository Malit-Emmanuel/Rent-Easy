# ADR-0008 Session lifetime and refresh-token rotation

Status: Accepted | Date: 2026-10-01

## Decision
Access token: 15 minutes (JWT, HS256). Refresh token: 30 days, opaque, stored only as a SHA-256 hash. Rotation on every successful refresh. Reusing an already-rotated or revoked refresh token, or refreshing from a different bound device, revokes the whole session family and is audited. Roles are read from the database on every request so suspensions apply immediately.

## Consequences / open items
Not yet built: IP-based throttling (needs a gateway or Redis), a scheduled job to purge expired OTP and refresh-token rows, and asymmetric JWT keys with rotation. Add before pilot.
