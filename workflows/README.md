# Workflows

- `editor/`: graphs saved from the ComfyUI editor. Open these in ComfyUI to inspect or
  change the pipeline.
- `api/`: the same graphs exported in API format. The web app submits these and maps
  its inputs onto node ids.

Both files for a workflow are exported from the same graph and committed together.
Model files they reference are listed in `../docs/models.md`.

## Stage 1: look

`editor/stage1_look.json`, `api/stage1_look.api.json`

Edits one frame of the driving clip with the reference images and returns candidate
stills. The candidates keep the clip's aspect ratio at about 1 megapixel, so the still
that goes into stage 2 already matches the clip's framing.

| Input | Meaning |
|---|---|
| Driving clip | the video stage 2 will animate |
| Frame time | which frame to edit, in seconds from the start |
| Reference 1 | the character, required |
| Reference 2 | optional: an outfit, a product or a place |
| Prompt | the edit; image 1 is the frame, image 2 is reference 1, image 3 is reference 2 |
| Candidates | how many stills one run returns, default 4 |

Output: PNG stills in `output/performance-remix/look_*.png`.

Prompt recipes for each mode are in the note inside the editor workflow.

### Skip option

Stage 1 is optional. When you already have the final image, load it into stage 2 as
its reference image and leave this workflow out. Keep its framing close to the clip's:
a close-up image with a full-body clip is the most common cause of bad results.

### API input map

| Node id | Class | Field | Set to |
|---|---|---|---|
| `2` | `LoadVideo` | `file` | uploaded driving clip |
| `3` | `Video Slice` | `start_time` | frame time in seconds |
| `7` | `LoadImage` | `image` | uploaded reference 1 |
| `17` | `TextEncodeQwenImageEditPlus` | `prompt` | the edit prompt |
| `13` | `RepeatLatentBatch` | `amount` | number of candidates |
| `21` | `KSampler` | `seed` | seed |
| `23` | `SaveImage` | output | the candidate stills |

Reference 2 is bypassed in the editor graph, so the API file has no node for it. To
use it, add a `LoadImage` node and link it to `image3` on both node `17` and node `18`.
