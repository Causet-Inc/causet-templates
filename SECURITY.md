# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch. Template content is consumed via `causet templates update`; use a current CLI and refresh your template cache regularly.

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Report sensitive issues through one of:

1. [GitHub private security advisories](https://github.com/Causet-Inc/causet-templates/security/advisories/new) (preferred)
2. Email **security@causet.cloud** with a description, impact, and reproduction steps

We aim to acknowledge reports within a few business days.

## Scope

In scope:

- Malicious or unsafe content shipped in this repository (templates, scripts, bundled assets)
- Instructions that could lead to credential leakage or unsafe defaults

Out of scope:

- Vulnerabilities in the Causet platform, CLI, or SDK — report those to the respective repositories
- Issues in user projects scaffolded from these templates

## Safe defaults

- Never commit real API keys. Use `env.example` with placeholders only.
- AI demos expect OpenAI keys via `causet secrets set`, not hard-coded values.
- Browser demos must be served over HTTP(S), not opened as `file://` URLs.
