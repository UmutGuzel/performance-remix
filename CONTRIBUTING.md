# Contributing

- Open an issue before a large change so the scope is agreed first.
- Work on a branch named `feature/<topic>` or `fix/<topic>` and open a pull request.
- Never commit model weights, videos larger than a few MB, or `.env.local`.
- Every model file a workflow uses must be listed in `docs/models.md` with its source
  link, size and license.
- Commit each workflow twice: the editor JSON under `workflows/editor/` and the API
  JSON under `workflows/api/`, exported from the same graph.
- Sample footage must be your own or public domain.
- Code is MIT. By contributing you agree your contribution is licensed the same way.
