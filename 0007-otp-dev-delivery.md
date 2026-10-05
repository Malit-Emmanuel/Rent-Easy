# ADR-0007 OTP delivery in development and staging

Status: Accepted | Date: 2026-10-01

## Decision
A fake SMS adapter is used in development and staging. It generates a realistic 6-digit OTP and logs it to the server console only. No real SMS is sent and no real phone numbers are used. The SMS provider stays behind the SmsPort interface, so production switches provider without changing authentication logic. The fake adapter throws if NODE_ENV=production, and config loading refuses to boot in production while vendors are fake.

## Consequences / open items
OTPs are stored only as HMACs. Real numbers must not be used in dev or staging. The production SMS vendor is chosen after legal and technical review (ADR-0004).
