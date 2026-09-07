# Prompt 02 — AI Usage & Attribution Directive

**Date:** 2026-09-07
**Author:** Human (project lead)
**Directed:** Restructuring of `plan.md` around ETHGlobal's AI usage policy; creation of this
`docs/prompts/` artifact directory; establishment of the per-file attribution convention.
**Verbatim, unedited.**

---

IMPORTANT: ETHGlobal's AI usage policy for this hackathon (ETHOnline 2026) — this must shape how plan.md and the rest of the project are documented throughout the build, not just noted once.

Policy text:
- Attribution: Clearly document in the submission where and how AI tools were used in the project. This includes specifying which parts of the code, specific files, or assets were generated or assisted by AI.
- Involvement: AI tools should be used to assist the development process, not to create the entire project. Submissions that rely entirely on AI without meaningful contributions from team members may not be eligible for partner prizes or finalist consideration.
- Spec-Driven Development: Using spec-driven workflows (e.g., OpenSpec, Kiro, spec-kit) is permitted. If used, all spec files, prompts, and planning artifacts must be included in the submission repository. Judges need to see the full picture of how the AI was directed, not just the generated output.

Because of this:
- Include a top-level "AI Usage & Attribution" section in plan.md itself, structured as a living log I'll keep updating as the project progresses: which files/components are AI-generated vs. AI-assisted vs. hand-written, and a running summary of how I (the human) directed the work at each major decision point.
- Treat plan.md, and this prompt itself, as submission artifacts to be committed to the repo — write plan.md with ETHGlobal judges as part of its audience, not just as an internal scratch document.
- As subsequent files (contracts, workflow code, frontend, etc.) get built, each should carry a brief attribution note (e.g. a header comment, or a corresponding entry back in plan.md) marking it AI-generated / AI-assisted / human-written, so the record stays accurate throughout rather than being reconstructed at the end.
- Clearly distinguish, throughout the plan, which parts represent my own meaningful design decisions and direction (core mechanism design, sponsor integration choices, demo scenario design) versus implementation detail that's reasonably AI-assisted — this distinction is what the "Involvement" requirement above is actually checking for.
