# signalkin (workspace)

Angular workspace for the [`signalkin`](projects/signalkin/README.md) library — relationships and everyday collection methods for `@ngrx/signals` entities.

## Projects

- `projects/signalkin` — the published library (see its README for the full API).
- `projects/sandbox` — a throwaway app used to verify the library's types against the packaged build.

## Commands

```
npm run build          # ng build (library)
npx ng build signalkin # build the library to dist/signalkin
npx ng build sandbox   # type-check the sandbox probe against dist
npx ng test signalkin  # vitest suite
```

Build the library before the sandbox — the workspace maps the `signalkin` import to `dist/signalkin`.

## Publishing

Only on explicit go-ahead:

```
ng build signalkin
cd dist/signalkin
npm publish --access public
```
