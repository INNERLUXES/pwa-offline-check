# Secure defaults

The default run is the safe run. Nothing below needs a flag, and none of it can be switched off.

## How the tool behaves by default

- **No network.** The tool reads files and sends nothing anywhere. It never fetches the manifest, a script or an icon, does not follow a link to another origin, does not download a page of a specification, and does not check for updates. The pages of the sources are saved in the repository.
- **No code is run.** The JavaScript of the page and of the worker is read as text by a tokenizer and a few patterns. It is never evaluated, never loaded as a module, and never given to a browser. The tool has no code path that calls `eval`, `new Function` or `import()` on input.
- **No commands.** The tool never runs a program, a shell, a browser or a package manager. No name, path or address from a file is put on a command line.
- **No dependencies.** Node 22 or newer and nothing else, so a check that runs on the build of an app adds no supply chain of its own. There is no `node_modules` to install before it runs.
- **Reads only inside the folder.** The tool opens the page, and the files that an address names under the site root. An address that climbs above the root is refused, a symbolic link is followed only to a place inside the root, and the real path of every file is checked against the real path of the root before it is opened.
- **Regular files only, bounded.** Each file is opened once, its type and size are taken from the open file, and anything that is not a regular file or is over its limit is refused before it is read. The total size and the number of files are bounded too.
- **Little of a file reaches the report.** The report shows a path, a name, an address or a cache name that the finding is about, cut to a length, and never a whole string, a comment or a body of a file. Control characters, line separators and direction controls are replaced by a space before any text reaches a report or an error message, so a hostile name cannot rewrite the terminal or reorder what a reader sees.
- **Strict formats.** In the Markdown report, pipes, backslashes, angle brackets and ampersands are escaped. In the CSV report, every cell is quoted as RFC 4180 says, and a cell that starts with `=`, `+`, `-` or `@` gets a leading quote so that a spreadsheet does not run it as a formula.
- **Linear time.** The tokenizer, the HTML reader and the JSON reader read each character once, and the call patterns look at a bounded number of tokens. Tests run megabytes of hostile text for each reader.
- **Unread is never fine.** A file that could not be read, a quoted value that is never closed, and a file cut by a limit are findings and not skips, and a check that cannot judge a case says so in a note.
- **The gate is on.** Without any option, an error makes the run exit with `1`. A pipeline that adds the tool notices a missing manifest link, a missing icon file, a file in the precache list that is not there, and an address over http, from the first run.
- **Writes nothing to disk.** The report goes to the screen. Redirect it to a file or the job summary only when you need to keep it.

## Running it safely on an app you do not know

1. A built app is data, and the tool treats it as data. Still, run it as a user with read access to the folder and nothing else; it needs no account, no key and no network.
2. Read the notes and the info findings: they say what was not read (a script from another address, a list built at run time, a worker that uses Workbox) and what was cut, so a pass is not taken for more than it is.
3. Keep the files you check free of real secrets. The tool does not print the content of a file beyond the names it reports, but the files may travel through other tools of your pipeline.
