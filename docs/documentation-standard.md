# Documentation standard

One documentation style for the whole repository. Every fact has exactly one
home, and a changed fact is changed in every record that states it.

## Where a fact lives

| Fact | Home |
| --- | --- |
| A decision and its rationale | [`decision-log.md`](governance/decision-log.md). A decision changes only through a new entry that names what it supersedes. |
| Current state, open work, pending owner decisions | `status.md` (index) and the `status-*.md` record of the area, edited in place |
| A tool behaviour, lesson, dead end or working command | The engineering notes of the area, in full detail (exact command, error text, cause, working alternative): `docs/architecture/*-engineering-notes.md` or `build-and-signing-engineering-notes.md` |
| Test or device evidence | A row in `validation-matrix.md` |
| A verification or investigation | `docs/research/<topic>.md`: question, method, evidence, conclusion |
| A design | `docs/superpowers/specs/<date>-<topic>-design.md` |
| Work that is still open | `docs/superpowers/plans/`. Delete the plan when the work is done and move any residue to the status record of the area or an ADR. |
| A device incident or audit | `docs/devices/<device>-<topic>-<incident\|audit>.md`: summary, cause, fix, evidence |
| A build or release record | `build-log.md` |
| Product intent and requirements | `oblivios-product-compass.md`, `requirements.md` |
| How agents work with the owner: rules and preferences, with the date of the correction | `owner-working-rules.md` |

## Not allowed

- Session records, transcripts, chronological logs and handoff prompts. A next
  session starts from `status.md` and the router, and looks decisions up in the
  decision log by ADR id; the decision log and the validation matrix are never read whole.
- A second statement of a fact that already has a home. Link to the home.
- A second store of project knowledge outside this repository: the auto-memory of the tool, the notes folder of the desktop app, work notes, ledgers, checkpoints, hand-over files, a scratch file kept past the session. The one exception is the untracked `.claude/local-server-memory.md`, which holds access coordinates only and never enters a commit.
- Dutch text. All documentation is English.
- A "superseded" banner on a record that is still wrong. Correct the record or
  delete it.

## Style

- Impersonal and factual. No first person, no narrative of who asked what.
  "The owner" is acceptable where a decision belongs to the owner.
- State is present tense. Evidence is past tense with a date.
- `status.md` and the `status-*.md` records hold durable state only. Timestamps, free disk space, load,
  process IDs, build status and what is currently on a device are snapshots:
  they belong in evidence records with a date, never in a status record.
- Every document starts with an H1 title and a first paragraph that states its
  purpose.
- No host, account, LAN address, device serial or Bluetooth address.
- Link with relative Markdown links. A backticked repository path must exist.

## Keeping records current

Editing in place is the rule. When a session changes a fact (an image number,
an ADR status, a row result, a patch number, a plan outcome), search the whole
repository for every earlier statement of it and correct each one in the same
commit. Append-only growth is how records go stale.

A status record is replaced, never appended to. It states what is true now and what
is open; it does not tell how it came to be. Image numbers, commit hashes, mutant
counts and per-run results belong in a matrix row, the build log or the engineering
notes, and the status record links there. The gate refuses a status line over 4000
characters.

The gate `tools/docs/check-docs.py` enforces the
mechanical rules: working links, no Dutch, no forbidden document kinds, existing
paths and ADR ids in the current-state records, and a title on every document.
It must pass before documentation is committed. The session close procedure is
`.claude/skills/session-close/SKILL.md`.
