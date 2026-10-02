# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "pwa-offline-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up app folder (a page, a manifest and a worker) that shows the problem, what you expected and what happened. Use made-up names, and no real data, credentials, internal addresses or customer information.

## Scope

In scope:

- an input that makes the tool fetch an address, open a network connection, open a file outside the folder it was given (through a `..` path, an absolute path, a symbolic link or a junction), run a program, or run the JavaScript it reads
- an input that makes the tool print more of a file than the path, name or address that a finding is about
- an input that makes the tool hang, take very long, or use unbounded memory, such as a very long string, a long run of quotes, slashes, backticks, brackets or tags, deeply nested JSON, very many scripts or imports, or a path that is not a regular file
- text from a file name, a cache name or a manifest member that breaks a Markdown table, injects a formula into a CSV report, or rewrites the terminal through control or direction characters
- a finding that docs/method.md says is reported, for an input the tool accepts, that the report leaves out, or a file that docs/method.md says is reported as not read that the report counts as checked

Out of scope: whether your app is installable or works offline in a browser (docs/limits.md lists what the files cannot show), the specifications and the behavior of browsers themselves, and how your pipeline stores the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
