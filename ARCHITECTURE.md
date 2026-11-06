# Project boundaries

```text
apps/web/src/
  app/          Next.js routes and providers
  components/   shared UI, layout, and app-level composition only
  features/     user-facing feature screens, grouped by domain
  context/      app-wide React state

packages/
  engine/       pure domain rules, schemas, and external API clients
  assembler/    authentication, persistence adapters, server actions, and hooks
  ai/           model execution
  storage/      storage contracts and implementations
```

Dependency direction:

```text
web → assembler → engine
              ↘ ai
              ↘ storage
```

- `engine` must not import Next.js, React, Firestore, or app UI.
- `assembler` must not import from `apps/web`.
- Feature-only UI belongs in `apps/web/src/features/<feature>`.
- Reusable visual primitives belong in `apps/web/src/components/ui`.
- KMA source data lives in `packages/engine/data`; runtime data is generated and never edited by hand.

## Adaptive AI pipeline

```text
natural language contract
  → deferred tool plan
  → deterministic count/schema check
  → sequential execution
  → response grounded only in execution results
```

- Models never execute write tools while planning. A complete plan is required before any write starts.
- Explicit counts such as “5건” are checked in code. An incomplete plan is retried according to the model profile and discarded if it remains incomplete.
- `AUTO`, `LOW`, `BALANCED`, and `HIGH` profiles control context size, step limits, timeout, and recovery passes independently of the provider.
- A future local/OpenAI-compatible provider only needs to supply an AI SDK `LanguageModel` plus its model ID; planning, validation, execution, and response logic stay unchanged.
