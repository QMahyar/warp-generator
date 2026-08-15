# Triage labels

The five canonical triage roles, each label string equal to its name. Used by
the `triage` skill as the `Status:` vocabulary in local issue files.

| Label | Meaning |
|-------|---------|
| `needs-triage` | Arrived raw; not yet classified |
| `needs-info` | Classified; waiting on missing information |
| `ready-for-agent` | Complete enough for an agent to implement; next stop: a ticket |
| `ready-for-human` | Needs the repo owner's decision, can't proceed without it |
| `wontfix` | Deliberately not fixing; reason recorded in the issue |