---
target: prototipo Guardias del equipo v2
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-guardias/guardias-equipo.html"
target_fingerprint: "sha256:6538b8cb64d0f68f1e3d49cfba54ee7b7dd828a18e3f7f13ecda561280eba5e5"
target_path: /tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-guardias/guardias-equipo.html
timestamp: 2026-11-04T07-53-45Z
slug: guardias-equipo-html
---
Method: dual-agent (A: design review · B: detector + browser measurements)

# Critique: prototipo Guardias del equipo (v2, bandeja y panel)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Unpressed Q-chip pending badge invisible in dark (1.28:1); selection change not announced |
| 2 | Match real world | 3 | "Falta MyNFQ" to-do shown in green OK pill |
| 3 | User control | 3 | Second approve within 5 s cancels first one's Deshacer and "Correo enviado" |
| 4 | Consistency | 2 | Panel right vs left in Vacaciones; "De Q3" uses Rechazada style; test guardia header says "Por resolver 1 de 1" |
| 5 | Error prevention | 3 | Otro concatenates (85 then 90 → 9085 €), no cap, decimals |
| 6 | Recognition | 3 | Must remember which sections follow the Q |
| 7 | Flexibility | 3 | Good keys; no mouse prev/next, no bulk MyNFQ |
| 8 | Minimalist | 3 | Empty dashed boxes with persona filter |
| 9 | Error recovery | 2 | No "ya la resolvió José Luis" / "no se pudo enviar el correo" states |
| 10 | Help | 2 | Tiers and MyNFQ ownership unexplained |
| **Total** | | **27/40** | Good |

## Specificity
Authored for the product: stage → sentence → confirm → 5 s countdown → "Correo enviado"; MyNFQ lifecycle; duration precedents. Brand rules hold. CLI: 3 findings (cramped-padding .bar-azul FP, overused-font Lato brand-required, unused --rayas token). Overlay (5 states): real dark low-contrast on .n.n-pend 1.3:1 (specificity of dark .chip:not([aria-pressed]) .n wins), dark placeholders 3.6:1, tiny-text .grupo small 10px. No overflow, no errors. User feedback: rejected under Aprobado fixed (verified); per-Q pending still ambiguous.

## Priority issues
- [P1] Q chips govern half the page: Q3 badge "1" but pending list unchanged with "De Q4" rows; Q1 shows "0 € · 0 min" beside full pending list; dark badge invisible. Fix: two bands "Trabajo pendiente · todos los trimestres" vs "Histórico de Q4" with chips inside, or badge filters pending; fix dark badge; "—" for zero. (/impeccable layout, clarify, colorize)
- [P1] Undo/selection under speed and latency: second action clears first countdown; slow backend jumps selection with open reject form now targeting another person; delete confirm retargets after shortcut approve. Fix: "Pendientes de enviar" tray with per-item undo, advance only if still on resolved row, close confirm on selection change, disable shortcuts while a dialog is open. (/impeccable harden)
- [P1] Field bugs: Otro concatenation/no cap/decimals; Z undo types "z" into motivo; Usar empty/negative silent. (/impeccable harden)
- [P2] Keyboard/SR: focus to BODY after reject/delete/test/Esc/item click; DOM order panel before list; countdown re-announced; kbd hints read; single-key shortcuts not toggleable; no skip link; menu focus 1.15:1; light borders 2.8–2.95. (/impeccable audit)
- [P2] Missing/wrong states: conflict and email-failure; vacio scenario doesn't show empty state; persona filter accent-sensitive, KPIs ignore it, wrong empty copy; test guardia labels/actions. (/impeccable harden, clarify)

## Persona red flags
- Alex: loses undo when chaining; same number key unstages; no bulk MyNFQ; J/K wraps silently.
- Sam: focus lost; chips announce hidden MyNFQ counts; group titles not headings; NVDA browse mode eats J/K/R/M.
- Casey: after approve viewport stays on amounts; tapped item scrolls under sticky header; toast 200px wide with Z key; chips/Más 30–34px.

## Minor
.grupo small 10px; static year 2026; toast covers shortcut legend; precedents on test guardia; lifecycle wraps on mobile; Borrar too light.

## Questions
1. Do Q chips belong on this page if pending work is quarter-independent?
2. Is MyNFQ alta coordination's job or a hand-off to someone else's inbox?
