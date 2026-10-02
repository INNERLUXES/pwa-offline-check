# 1. Read the files, not the browser

## Context

The tool needs to say what stops a built web app from installing, working offline or updating safely. There are richer ways to know: open the app in a browser and read its application panel, run a browser audit, drive the app with a test browser, fetch the live manifest and worker from the deployed address, or run the worker and watch what it caches. Each of them needs a browser, a deployed address or a network, and some of them run the code of the app, which in a pipeline that checks pull requests is code from someone who may be outside the team.

A set of files does not say everything. A header can change the scope of a worker, a server can rewrite an address, a build can add a list of files after the check, and a worker can compute the address it caches. The tool cannot see any of that.

## Decision

The tool reads the built folder as text, with its own readers for HTML, JSON and JavaScript, and never runs, fetches or loads anything. It takes every requirement and every quoted sentence from pages that are saved with their addresses (the W3C specifications, MDN, web.dev and the Workbox documentation), and a test compares the code with the saved text. The install criteria of a browser are kept apart from what the specifications require, and a finding says which one it rests on. Where a finding rests on a conclusion that no source states (a missing icon file is a failed fetch, a precache entry that does not exist fails the install, a cache name without a digit is unversioned), the message says that the conclusion is the tool's own.

The JavaScript is read with a tokenizer that skips comments, strings, template literals and regular expressions, and the checks are patterns on the tokens. They do not follow which function calls which. This is a limit that is stated, and it keeps the time linear and the reading predictable.

An address is read as a browser reads it and looked up under the site root, and an address that leaves the root is refused. A thing the tool cannot read is reported, never skipped: a script from another address, a list built at run time, a worker that uses Workbox, a file cut by a limit.

## Consequences

The check runs in a second, on Linux, macOS or Windows, with only Node, no browser and no network, and no input can make it run code or reach a host. The same files give the same report, so it can run on every pull request and gate a release. The price is that it reports what the files show, not what a browser will do on a device. A worker that builds its cache list at run time gets an info finding and not a verdict, and a pass is not a tested PWA. The person who reads the report decides, and tests the app in a browser before release.
