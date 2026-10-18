# Workflows

- `editor/`: graphs saved from the ComfyUI editor. Open these in ComfyUI to inspect or
  change the pipeline.
- `api/`: the same graphs exported with "Export (API)". The web app submits these and
  maps its inputs onto node ids.

Both files for a workflow are exported from the same graph and committed together.
Model files they reference are listed in `../docs/models.md`.
