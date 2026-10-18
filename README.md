# Performance Remix

Motion transfer for real footage, as a ComfyUI workflow and a small web app.

Give it a clip and a few reference images. It keeps the clip's motion, camera, timing
and audio, and re-renders the character, the environment, the visual style, or one
object. Everything runs locally in ComfyUI on open-weights models. No external API.

## What it does

Inputs

- Source video, 3 to 30 seconds, any phone footage works.
- 1 to 8 reference images: the character, outfit, product, location or style you want.
- A short text prompt.
- A mode.

Outputs

- A new video, 720p to 4K, with the original audio track.
- A side-by-side before/after version of the same clip.

| Mode | You give | You get |
|---|---|---|
| Character | a clip of someone performing, images of a character | the character performing the clip, same motion, same camera, same voice |
| World | a clip, images of a place | the same person and performance in that place |
| Style | a clip, a style name or image | the same clip in that style, which can change per segment |
| Object | a clip, one masked element, an image of its replacement | the clip with only that element changed |

## How it works

1. Ingest: trims and resizes the clip, normalizes frame rate, keeps the audio aside.
2. References: packs the reference images into one labeled reference sheet the model
   can read.
3. Masks and control: a person or object mask for World and Object modes, pose or depth
   maps where the generation model needs them.
4. Generation: an open-weights video model conditioned on the driving clip and the
   reference sheet. Long clips are generated in overlapping windows with the motion
   carried across each seam.
5. Finish: video super-resolution, sharpening and grade, then a high-bitrate export
   with the source audio muxed back in.

## Requirements

- ComfyUI, current version, with the Wan Animate 2 and LTX-2.5 nodes that ship in core.
- NVIDIA GPU with 24 GB VRAM for 480p, 32 GB recommended for 720p and above.
- About 40 GB of disk for models.
- Node 22 or newer for the web app, ffmpeg on the PATH.

## Running

In ComfyUI only

1. Download the models listed in `docs/models.md` into your ComfyUI `models` folders.
2. Open a workflow from `workflows/editor/` in ComfyUI.
3. Set the video, reference images and prompt, then queue.

With the web app

1. Start ComfyUI.
2. Install and start the API proxy: `pip install comfy-api-proxy` then `comfy-api-proxy`.
3. Copy `.env.example` to `.env.local`. The default points at the local proxy.
4. `npm ci` then `npm run dev`, open http://localhost:3000.

Hosted: set `COMFY_API_KEY` and `COMFY_DEPLOYMENT_ID` in `.env.local` to run the same
app against a Comfy API deployment instead of a local ComfyUI.

## Models

| Role | Model | License |
|---|---|---|
| Generation | Wan-Animate-2 14B or LTX-2.5 22B distilled | Apache 2.0 / LTX-2.x Community |
| Object mode | Wan2.2-Animate 14B | Apache 2.0 |
| Masks | SAM2 | Apache 2.0 |
| Depth and pose | Depth Anything, DWPose | see `docs/models.md` |
| Finish | SeedVR2 3B or 7B | Apache 2.0 |

Exact files, sizes and download links are in `docs/models.md`. Weights are never
committed to this repository.

## Repository layout

```
app/        Next.js app; Comfy SDK calls run on the server
workflows/  editor/ graphs to open in ComfyUI, api/ graphs the app submits
docs/       model list and licenses, VRAM notes
samples/    small example inputs
```

## Status

Early development. The Character mode workflow comes first; Object, World and Style
follow.

## License

MIT, see `LICENSE`. Model licenses are separate and listed in `docs/models.md`.
Built for Comfy Org's Open Source Higgsfield competition.
