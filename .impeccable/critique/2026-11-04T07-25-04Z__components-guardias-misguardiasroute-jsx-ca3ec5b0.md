---
target: Guardias (/guardias y /guardias-gestion)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/user/team-hub/beyond-the-grid/components/guardias/MisGuardiasRoute.jsx"
target_fingerprint: "sha256:a7dbf7472b568effca13874130f65282d714d360d96e00c9925f78b0245297a7"
target_path: /home/user/team-hub/beyond-the-grid/components/guardias/MisGuardiasRoute.jsx
timestamp: 2026-11-04T07-25-04Z
slug: components-guardias-misguardiasroute-jsx-ca3ec5b0
---
Method: dual-agent (A: design review · B: detector + browser measurements)

# Critique: Guardias (/guardias y /guardias-gestion)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | reload() blanks the page to a generic skeleton after every approve/MyNFQ/delete; scroll lost (999→177); approve gives no confirmation |
| 2 | Match real world | 3 | Domain language right; literal `Otro importe: "" €`; 30/70/120/240 tiers unexplained |
| 3 | User control | 1 | One click on an amount approves irreversibly (backend refuses re-resolve); only exit is Borrar after email sent; member can't edit/withdraw pending |
| 4 | Consistency | 1 | Old glass layer next to redesigned Vacaciones/Pases; Lucide icons + 🧪 emoji; two primary colours in light; myNfq vs MyNFQ |
| 5 | Error prevention | 1 | Reversed hours, zero length, 2019/2027 dates accepted; date defaults to today (wrong after midnight); Borrar on pending rows |
| 6 | Recognition | 2 | Coordinator must compute shift length and match an unwritten tier policy |
| 7 | Flexibility | 2 | Quick amounts and ?id= deep link good; no J/K/A queue, no "not in MyNFQ" filter, no person filter |
| 8 | Minimalist | 2 | Each pending shown twice with full controls; 16 amount buttons on one screen |
| 9 | Error recovery | 3 | Honest copy: email-failed notice, check-before-retry, HTML-page explanation |
| 10 | Help | 2 | Inline help, nothing on what counts / pays / who records in MyNFQ |
| **Total** | | **19/40** | Poor |

## Specificity
Category-interchangeable form + card list; only domain words, quick amounts and test guardia are product-specific. Missed anchor: a guardia comes from an existing Pase Calendado. Off the redesigned hub language (48px serif h1 with Lucide clock vs 44px icon plate; serif h2s; light primary stays Mandarin via inline style escaping globals.css:443). Detector CLI: 0 findings (opacity tints only fail rendered). Overlay injected in 6 states, 36 findings: low-contrast sand/30 1.9:1, sand/40 2.5:1, sand/45 2.9:1, sand/50 3.3:1 in light; placeholder #9ca3af 2.4:1; field borders 1.26 light / 1.5 dark; 10px labels (undersized-ui-text). No clear false positives. No overflow, no console errors.

## Priority issues
- [P0] Money approval is one click, irreversible. Fix: stage amount then confirm, or apply with 5 s Deshacer toast; Borrar into ⋯ menu, hidden on pending. (/impeccable harden)
- [P1] Every action blanks the page (datos.js:44 setSnap(null)). Fix: patch row from POST response, focus next pending, layout-shaped skeleton. (/impeccable optimize, polish)
- [P1] Duplicated queue without decision support: 5 Rechazar + 8 Borrar for 2 pending; ?id=g1 highlights both copies, ?id=g7 other Q not highlighted. Fix: each pending once, duration "3 h · cruza medianoche", suggested tier preselected, Q summary (€ total, approved not in MyNFQ + filter), J/K/A, fix "", deep link switches Q. (/impeccable distill, layout)
- [P1] Member form accepts impossible data, weak at night of the pase: today default wrong after midnight, no next-day cue, one bold line as success, no edit/withdraw. Fix: pick from recent pases, live duration, block ≤0, highlight new row, edit/withdraw pending. (/impeccable harden, clarify)
- [P2] Off-system visuals and a11y: same Electric pill for all three statuses in light, Lucide/emoji icons, serif h2, contrast <3:1, no aria-live, "30 €, botón" ×4 without person, Borrar before approve in tab order. Fix: Vacaciones/Pases language, BBVA icons, distinct states, aria-live, aria-labels. (/impeccable typeset, colorize, audit)

## Persona red flags
- Alex: 16 identical amount chips, no keyboard queue, mental duration math, MyNFQ backlog by scanning, Q select lists empty quarters.
- Sam: disabled submit unreachable by Tab; focus lost after approve; 🧪 read as "tubo de ensayo"; textarea name includes help; Otro importe confirm unnamed, Enter doesn't submit.
- Jordan: doesn't know what counts/pays/which date after midnight; "Pendiente de dar de alta en myNfq" doesn't say who; can't fix typo.
- Casey: form fills first screen at 390 (list at y=855); today default after midnight; no next-day cue; no draft.

## Minor
Pendientes oldest-first vs Q newest-first; Q repeated on every row; "Resuelta por" 11px/40%; test-guardia message never clears; native window.confirm; dead rdr-blob spans; hardcoded #001391/#88E783; empty states without next step.

## Questions
1. Request a guardia from an existing Pase Calendado?
2. If amount derives from duration and tier, why choose it per row instead of confirming a suggestion?
3. Is MyNFQ a lifecycle step to show as a pipeline rather than a checkbox?
