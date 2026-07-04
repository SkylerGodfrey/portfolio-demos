# portfolio-demos

Public storage + pipeline repo for the [skylergodfrey.com](https://skylergodfrey.com)
portfolio showcase. **Managed by Terraform** in
[`repository-definitions`](https://github.com/SkylerGodfrey/repository-definitions) —
do not hand-edit; changes here will be overwritten on the next `terragrunt apply`.

## What lives here

- `.github/workflows/portfolio-demo.yml` — the reusable workflow that flagged
  project repos call to build and publish their demo. Hosted here (public) so both
  public and private project repos can call it.
- `<project-slug>/` — one directory per project, each containing that project's
  built static demo bundle, its `manifest.json`, and an optional preview clip.
  These are published by the pipeline, not by hand.

Each `<slug>/manifest.json` matches the portfolio site's `DemoManifest` type:

```json
{ "demoUrl": "https://skylergodfrey.com/demos/<slug>/", "previewClipUrl": null }
```

## How it is served

The portfolio site's deploy workflow shallow-clones this repo into `public/demos/`
before the Astro build, so everything is served **same-origin** at
`skylergodfrey.com/demos/<slug>/`. This repo is never a Git submodule of, nor
committed into, the portfolio site repo — its (potentially large) binaries stay
out of the site's Git history.

See `docs/demo-pipeline.md` in repository-definitions for the full contract,
onboarding steps, and auth setup.
