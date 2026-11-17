# remember-this

Record a best practice, lesson learned, or recurring implementation pitfall so it is never forgotten.

## When to use

Invoke this skill when you encounter:
- A bug pattern likely to recur (e.g. solo-online DB writes, dead events between React ↔ Phaser)
- A new architectural constraint or convention worth codifying
- A gotcha that cost debugging time and should be documented for future sessions

## Procedure

1. **Identify the lesson** — summarise the issue, root cause, and fix in 1-3 sentences.
2. **Choose the target file** — by default, append to `.github/copilot-instructions.md` under the most appropriate section:
   - **Common Gotchas** — one-line numbered entries for pitfalls (most common target)
   - **Key Patterns** — subsections for recurring code patterns (e.g. *Dual-Mode Data Bridge*, *React ↔ Phaser Event Sequencing*)
   - **Code Conventions** — style and convention rules
   - **UI Display Rules** — rendering and display constraints
   - If the lesson doesn't fit any existing section, add a new `###` subsection under the appropriate `##` heading.
3. **If a different file would be more appropriate** (e.g. a new `.github/prompts/*.prompt.md` skill, the README, or a spec file), suggest it to the user and **ask for confirmation before creating or updating** that file.
4. **Write the entry** — use the same style as existing entries:
   - Gotchas: `N. **Bold title**: Explanation. **Always do X** / **Never do Y**. See `file.js` method for canonical pattern.`
   - Patterns: `### Pattern Name` with a paragraph + code snippet if helpful.
5. **Cross-reference** — if the lesson relates to an existing gotcha or pattern, add a brief link or "see also" note.
6. **Announce** — confirm to the user what was added and where.

## Rules

- Keep entries concise — future agents scan these quickly.
- Never duplicate an existing entry; instead strengthen or extend it.
- Bold the actionable phrase (the "always" / "never" / "must" clause).
- Include at least one file reference so future agents can grep for the canonical implementation.
- Number new gotchas sequentially (current highest: 9).
