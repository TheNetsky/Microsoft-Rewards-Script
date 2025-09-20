# Security Policy

We take the security of this project seriously. Please follow this policy when you believe you have found a vulnerability.

## Supported Versions

We aim to keep the latest minor of the most recent major release supported for security fixes.

- 2.x: security fixes accepted (current)
- 1.x: not supported

If you rely on an older version, please consider upgrading.

## Reporting a Vulnerability

Please report security issues privately so we can triage and fix them before public disclosure.

Preferred channels (choose one):

1. GitHub Security Advisories (recommended):
   - Go to the repository page → "Security" tab → "Report a vulnerability" and follow the flow to create a private advisory.
2. Email (fallback):
   - If you cannot use GitHub Advisories, contact the maintainer privately (replace with your contact): security@example.com

Include the following in your report when possible:
- Affected version(s) and environment (OS, Node.js version, container or bare-metal)
- Minimal steps to reproduce (PoC), expected vs. actual behavior
- Impact assessment (confidentiality/integrity/availability), and any CVSS thoughts if you have them
- Workarounds or mitigations, if any

Response commitment:
- We will acknowledge your report within 3 business days
- We will provide a status update at least every 7 days until resolution
- We strive to release a fix or mitigation within 90 days depending on complexity and risk

Credit: We are happy to credit reporters in release notes/advisories unless you prefer to remain anonymous.

## Coordinated Disclosure

- Please do not publicly disclose the issue or share details beyond the reporting channels until a fix/mitigation is released and we agree on a disclosure date.
- After a patch is released, we may coordinate a public advisory that references the fix and credits you (if desired).

## Scope and Rules of Engagement

When researching and testing, please:
- Only test against your own accounts and data; do not access, modify, or exfiltrate data that isn’t yours
- Do not perform actions that degrade service for others (no DoS/DDoS, brute force, or spam)
- No social engineering, phishing, physical access, or third-party service attacks
- Respect applicable terms of service (e.g., Microsoft/Bing) and local laws
- Avoid automated scanning that can trigger rate limits or abuse protections

If you are unsure whether something is in scope, ask privately before proceeding.

## Safe Harbor

If you follow this policy in good faith while researching and reporting, we will not initiate legal action against you for your research activities that are consistent with this policy.

## Dependency Vulnerabilities

If the vulnerability is in a dependency, please consider also reporting it upstream to the maintainers of that package. We will still track the issue here and update/patch as needed.

## Security Hardening Tips (Users)

- Keep your Node.js runtime and dependencies up to date
- Store secrets (tokens, cookies, TOTP secrets) outside of source control and rotate them periodically
- Prefer environment variables or secret managers over committing credentials
- Review release notes before upgrading and test in a controlled environment

Thank you for helping keep this project and its users safe.
