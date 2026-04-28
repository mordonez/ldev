# Diagnose Discipline

A disciplined loop for hard Liferay bugs and performance regressions. Use it on
top of the Liferay-specific commands in `SKILL.md`. Skip phases only when
explicitly justified.

Phases: **Build a feedback loop → Reproduce → Hypothesise → Instrument → Fix +
regression test → Cleanup + post-mortem.**

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. With a fast, deterministic,
agent-runnable pass/fail signal for the failure, hypothesis testing and
instrumentation just consume that signal. Without one, no amount of staring at
logs will fix the bug.

Spend disproportionate effort here. Be aggressive. Be creative. Refuse to give
up.

### Liferay-specific feedback loops to try, in rough order

1. **`ldev logs diagnose --json` tail** with a unique correlation tag injected
   into the failing path. Re-run the trigger and assert the tag appears in the
   diagnosed report.
2. **Targeted `curl` against a Headless API endpoint** that exercises the bug
   path. Capture the response body and status. Compare against a known-good
   snapshot if available.
3. **`ldev portal inventory ...` snapshot diff.** Run inventory on the affected
   Site / Page before and after the trigger; diff the JSON. Useful when the
   symptom is "field disappeared", "template lost binding", "structure key
   changed".
4. **OSGi bundle diag delta.** `ldev osgi diag <bsn> --json` before and after
   deploy or restart. Asserts on missing requirements, capability mismatches,
   wired services.
5. **Playwright session against the affected URL.** Open once, capture the DOM
   shape and console errors. Re-run after any change. Reuse the same session.
   See `automating-browser-tests` for the exact pattern.
6. **Replay a captured request.** Save the exact failing request payload
   (`/o/headless-...`, portlet action, fragment configuration import) and
   replay it through `curl` or a Playwright `run-code`. Cheaper than driving
   the UI each time.
7. **Database snapshot harness.** When the bug depends on production-like
   state, `ldev db sync` once, snapshot, and use `ldev env restore` to reset
   between iterations. Inside a worktree, never against main.
8. **Differential loop across worktrees.** Same input through main vs. an
   isolated worktree with the candidate fix. Diff outputs.
9. **HITL bash script.** Last resort when a human must drive a UI step. Use
   the structured loop pattern: `step "instruction"` and `capture VAR
   "question"`, parse captured values back to the agent. Keeps even manual
   steps reproducible.

Build the right loop, and the bug is 90% fixed.

### Iterate on the loop itself

Once you have *a* loop, ask:

- Can I make it faster? (skip `ldev start` when the env is already up; cache
  bootstrap with `--cache=60`; narrow `ldev logs --since 30s`)
- Can I make the signal sharper? (assert on the **specific symptom**, not
  "exit code 0")
- Can I make it more deterministic? (pin time, mount a fixed doclib, freeze
  search reindex, lock the worktree environment)

A 30-second flaky loop is barely better than no loop. A 2-second deterministic
loop is a debugging superpower.

### Non-deterministic Liferay bugs

Common offenders: search reindex timing, async scheduler tasks, OSGi service
ranking races, cache eviction, locale negotiation under concurrent requests.

The goal is not a clean repro but a **higher reproduction rate**. Loop the
trigger 100×, parallelise where safe, narrow timing windows. A 50% flake is
debuggable; 1% is not — keep raising the rate until it is.

### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for:

- (a) access to a runtime that reproduces it (worktree, UAT, prod-like)
- (b) a captured artifact (`ldev logs --since N --no-follow` dump, thread dump
  via `ldev osgi thread-dump`, HAR file, screen recording with timestamps)
- (c) permission to add temporary diagnostic logging to a specific bundle

Do **not** proceed to hypothesise without a loop.

## Phase 2 — Reproduce

Run the loop. Watch the failure appear.

Confirm:

- [ ] The loop produces the failure mode the **user** described, not a
      different failure that happens to be nearby. Wrong bug = wrong fix.
- [ ] The failure is reproducible across multiple runs (or, for non-
      deterministic bugs, at a high enough rate to debug against).
- [ ] You captured the exact symptom (error message, wrong rendered output,
      slow timing, missing field) so later phases can verify the fix actually
      addresses it.

Do not proceed until the bug reproduces.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-
hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**. State the prediction it makes:

> "If `<X>` is the cause, then `<changing Y>` will make the symptom disappear /
> `<changing Z>` will make it worse."

If you cannot state the prediction, the hypothesis is a vibe — discard or
sharpen it.

**Show the ranked list to the user before testing.** Liferay devs often have
domain knowledge that re-ranks instantly ("we just changed the indexer for
Articles" / "factory PID `Foo~bar` was added last week"). Cheap checkpoint, big
time saver. Do not block on it — proceed with your ranking if the user is AFK.

### Liferay-specific hypothesis sources

- Recent commits touching modules in `bnd.bnd` requirements graph
- Recent OSGi configuration changes (`ldev portal config get <pid>`)
- Recent Structure / Template / ADT imports (`ldev portal inventory ... --json`
  vs. git history of the resource files)
- Recent reindex events (`ldev portal reindex tasks --json`)
- Recent worktree operations that may have left stale state

## Phase 4 — Instrument

Each probe must map to a specific prediction from Phase 3. **Change one
variable at a time.**

Tool preference:

1. **`ldev logs diagnose --json` first.** It is task-shaped; it categorises.
2. **OSGi-level inspection** (`ldev osgi status`, `ldev osgi diag`) for
   bundle / wiring questions.
3. **Targeted log statements** at the boundaries that distinguish hypotheses,
   in the matching module, with a unique tag prefix per session, e.g.
   `[DEBUG-a4f2]`.
4. **Never "log everything and grep".**

**Tag every debug log** with a unique short prefix. Cleanup at the end becomes
a single grep. Untagged logs survive accidentally; tagged logs die together.

**Performance branch.** For slow page renders, slow Headless responses, or
slow imports, logs are usually wrong. Instead:

1. Establish a baseline measurement (Playwright `page.metrics()`, timed
   `curl`, `ldev portal check --json` timing, query plan via DB inspection).
2. Bisect: change one variable (cache enabled / disabled, single bundle
   redeploy, smaller dataset).
3. Measure first, fix second.

## Phase 5 — Fix + regression test

Write the regression test **before the fix** when there is a **correct seam**
for it.

A correct seam is one where the test exercises the **real bug pattern** as it
occurs at the call site. If the only available seam is too shallow (a unit
test on a helper when the bug needs a full bundle wiring chain), a regression
test there gives false confidence.

**If no correct seam exists, that itself is the finding.** Note it. The
codebase architecture is preventing the bug from being locked down. Flag it.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam (JUnit / Spock
   for Java, Playwright for browser-visible behaviour, integration test
   against `ldev portal inventory ...` for resource state).
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original (un-minimised)
   scenario.

## Phase 6 — Cleanup + post-mortem

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or absence of seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed (single `grep` to verify)
- [ ] Throwaway harness scripts deleted or moved to a clearly-marked debug
      location
- [ ] The hypothesis that turned out correct is stated in the commit message —
      so the next debugger learns
- [ ] If the fix changed an OSGi configuration: the new value is recorded in
      project source (`configs/[env]/osgi/configs/` or `liferay/configs/`),
      not only applied to the live runtime
- [ ] If the fix involved a Structure / Template / ADT / Fragment import: the
      repository contains the intended source of truth (re-export to verify)

**Then ask:** what would have prevented this bug? If the answer involves
architectural change (no good test seam, tangled bundle dependencies, hidden
coupling between Pages and Templates), capture it as a `docs/ai/project-
learnings.md` entry through `capturing-session-knowledge` — and, when the
learning is durable enough to record a real trade-off, propose an ADR under
`docs/adr/`.

Make the recommendation **after** the fix is in, not before — you have more
information now than when you started.
