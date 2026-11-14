---
target: Mis guardias (/guardias)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/user/team-hub/beyond-the-grid/components/guardias/MisGuardiasRoute.jsx"
target_fingerprint: "sha256:a7dbf7472b568effca13874130f65282d714d360d96e00c9925f78b0245297a7"
target_path: /home/user/team-hub/beyond-the-grid/components/guardias/MisGuardiasRoute.jsx
timestamp: 2026-11-14T12-15-46Z
slug: components-guardias-misguardiasroute-jsx-ca3ec5b0
---
Method: dual-agent (A: design review · B: detector + browser measurements)

# Critique: Mis guardias (/guardias, vista de miembro)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | Success is one line under the button; new row not highlighted/announced, off-screen on mobile; no duration preview |
| 2 | Match real world | 2 | "Día del Pase Calendado" ambiguous after midnight; no weekday; raw "2026Q4" |
| 3 | User control | 1 | Pending request cannot be withdrawn or corrected (no backend action) |
| 4 | Consistency | 1 | Old glass layer, non-BBVA icons, serif h2s, myNfq vs MyNFQ, pills differ from coordinator |
| 5 | Error prevention | 1 | Date defaults to today (wrong after 00:00, stale in long-open tab); reversed and equal hours accepted (10:00–10:00 = 24 h for coordination); no date range; no duplicate-day warning |
| 6 | Recognition | 2 | Must remember the pase date and compute next-day end |
| 7 | Flexibility | 2 | Not a <form>: Enter does not submit |
| 8 | Minimalist | 3 | Lean; help repeats placeholder; load error twice; Q on every row |
| 9 | Error recovery | 3 | Honest copy; failed history read disables submit, no retry |
| 10 | Help | 2 | Nothing on what counts or who registers in MyNFQ |
| **Total** | | **19/40** | Poor |

## Specificity
Generic form + card list; only the words are product-specific. Off the redesigned member language (Mi TR, Mis vacaciones, new Guardias del equipo): 48px serif h1 with stroke icon, serif h2s, Lucide-style IconClock/IconPlus/IconAlert, Mandarin primary in light via inline style. CLI: 0 findings. Overlay (4 states, 8–9 findings each, all real): 10px labels 3.3:1 light; help 10.5px 2.5:1 light / 3.5:1 dark; "Necesarios…" and myNfq line 11px 2.9:1 light; "· 2026Q4" 1.9:1 light; placeholder #9ca3af 2.4:1 light; field borders 1.26 light / 1.57 dark. Light status pills identical (Electric on white). No overflow except a 120-char unbroken word at 390 (1208 scrollWidth). No console errors.

## Priority issues
- [P0] Wrong shifts recorded silently (affects pay): FORM_VACIO date computed at module load (wrong after midnight, stale), reversed/equal hours pass, coordinator minutos() makes 10:00–10:00 = 24 h, no range or duplicate check. Fix: compute at mount, before 12:00 default to yesterday or last Pase Calendado, weekday shown, live summary "3 h 30 · termina el sáb 14 a las 01:30", block zero, warn >10 h, date within last 90 days, duplicate warning. (/impeccable harden, clarify)
- [P1] Cannot correct or withdraw a pending request. Fix: backend retirar/corregir while pending; Retirar with 5 s Deshacer, Corregir on pending rows. (/impeccable harden)
- [P1] Submit feedback and a11y: focus to BODY, nothing announced, no live region, disabled submit unreachable, help inside label, two simultaneous clicks send two POSTs. Fix: <form onSubmit>, lock fields while sending, role=status toast, highlight + focus new row, say which field is missing, aria-describedby. (/impeccable polish, audit)
- [P2] Off-system visuals and contrast: identical light pills; move to .vacu (Mandarin plate + BBVA alarm, clamp h1, Lato h2, IconoBBVA), solid .gu-est pills + Pedida → Aprobada → En MyNFQ strip, text ≥4.5:1, labels 12–13px, borders ≥3:1, fDia/qTxt dates, MyNFQ spelling, break long words. (/impeccable typeset, colorize, layout)
- [P3] Failed history read blocks submitting; error shown twice, no Reintentar. (/impeccable harden)

## Persona red flags
- Jordan: which date counts; who does MyNFQ; what counts as a guardia; "2026Q4" jargon.
- Casey (00:30, phone): date pre-filled with next day; three native pickers; no next-day cue; success at screen edge, new row off-screen; cannot fix.
- Sam: 14 tabs to submit; disabled submit unreachable; Enter does nothing; focus lost, nothing announced; labels read uppercase.

## Minor
"coordinación ha recibido el aviso" overclaims; success stays while editing; history sorted by creation not shift date; no resolver/duration shown; dead rdr-blob spans; empty state without next step; backend error lacks full stop before "Antes de reintentar".

## Questions
1. Pick the pase from the Pases calendar instead of typing a date?
2. Show the expected amount before sending?
3. Should the history weigh as much as the form?
