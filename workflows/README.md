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
The web app does not use Reference 2.
For an object swap the app first hides the old object from the edit model
(`hideOldObject`): SAM 3.1 Detect finds it on the frame (nodes `40` to `42`), and its mask,
grown by 24 px, is filled with flat 50% gray before the frame is scaled (nodes `43` to
`47`, into node `6`). Then one pass runs with `objectLookPrompt` ("In image 1 a flat gray
shape covers the car. Replace the gray shape with ... same position, size in frame and
angle ... a real photograph ... add no people ..."). Shown the old car, Qwen kept its
design: 6 of 6 looks of "a yellow 1990s pickup truck" on the highway clip kept the
sedan's twin grille, also with "nothing of the car stays" in the prompt and with the car
blurred; with the gray shape 0 of 4 did, and the driver stayed as dark as in the clip.
The image of the new object is optional: without one, the app deletes node `7` and the
`image2` inputs of nodes `17` and `18` (`dropReference`). An object swap
can also skip this stage: the user's own edited first frame then goes to stage 2 as the
approved still, and the app refuses it when its shape differs from the clip's by more
than 2% (`frameShapeError`, checked in the browser and again on the server).
`npm test` checks that every node and input the app sets exists in these files.

### Stills that work in stage 2

Stage 2 copies a lot from the still, not only the face: Viggle-Animate keeps the body
size, the background and the head turn of the still, and SCAIL-2 starts from it.
Three things in the stage 1 prompt made the difference in tests:

- Spell out the clip frame's pose ("both fists raised in front of his chin, seen from
  head to feet") and say "do not use the pose of the painting". Then pick the candidate
  whose pose matches the frame.
- Name what the background of the frame shows ("the grey concrete wall, the wooden coat
  rack with the black cap, the exposed red brick") and write "replace only the man;
  everything around him stays exactly as in image 1 and stays a real photograph". Without
  it, a painting reference repaints the whole frame and that background shows up in the
  video.
- Pick a frame where the face is visible, not covered by a hand.

When the reference style still repaints the background (thick brush strokes did), edit
the frame twice: once with only the frame and the prompt "remove the person, show the
empty room behind them", then cut the painted person out of a candidate and place it on
that empty room.

## Which stage 2 engine

All three run the same stage 1 still and the same clip. Measured on a 32 GB GPU on three
Pexels clips (cooking, martial arts, talking at a table) with the same still per clip,
first 81 frames, in that order. Likeness is the insightface similarity to the still;
arm error is the distance of shoulder, elbow and wrist from the clip's joints in torso
lengths (MediaPipe Pose); expression is the correlation of mouth, eye and brow movement
with the clip over time (MediaPipe Face Mesh); face sharpness is the Laplacian variance
of a 256-pixel face crop.

| | Viggle-Animate (default) | Wan2.2 Fun Control | SCAIL-2 |
|---|---|---|---|
| Likeness to the still | 0.880 / 0.582 / 0.866 | 0.472 / 0.439 / 0.607 | 0.929 / 0.307 / 0.764 |
| Arm error | 0.107 / 0.142 / 0.073 | 0.072 / 0.083 / 0.086 | 0.174 / 0.081 / 0.069 |
| Joints within 0.2 torso lengths | 77% / 77% / 76% | 84% / 87% / 77% | 58% / 82% / 75% |
| Expression correlation | 0.18 / 0.21 / 0.74 | 0.22 / 0.16 / 0.74 | 0.38 / 0.38 / 0.73 |
| Face sharpness | 95 / 204 / 95 | 73 / 62 / 49 | 48 / 61 / 50 |
| Time for 90 frames (24 fps) | 266 / 199 / 317 s | 104 / 97 / 106 s | 380 / 362 / 364 s for 81 frames |
| Output size | 704x1248 | 576x1024 | 704x1248 |
| Weights license | MiniMax H3 Community License | Apache 2.0 | MIT; SAM 3.1 under the SAM License |

What the frames show:

- **Viggle-Animate**: the sharpest faces and the closest likeness on two of the three
  clips. On one fast punch toward the camera the face turns into loose strokes, and in the
  talking clip the head slowly turns toward the camera instead of following the speaker's
  small head turns.
- **Fun Control**: follows the body most closely and is two to three times faster. The
  face smears when a fist passes in front of it, and it changed the downcast Vermeer face
  into a raised, smiling one.
- **SCAIL-2**: copies expressions best in the martial-arts clip and keeps the clip's own
  room behind the person when SAM 3 finds them (talking clip), but re-drew the dojo with
  a ceiling and a blue wall. The slowest of the three.

The Fun Control numbers above were measured at 576x1024. The app now renders Fast at
720x1280: on a 5-second dance clip it took 246 s instead of 152 s, with clearly sharper
fur and edges; the app's 1.5x upscale brings it to 1080x1920.

**Animals.** With a photoreal ginger cat as the character on the same dance clip, Fast
kept the cat and moved it with the dancer, lit by the room's window light. Viggle-Animate
drew a woman in a black suit instead: it is trained to swap a person for a person. Use
Fast to try an animal look, and "Best for animals" (below, under Fun Control) for the final
render: its fur is steadier from frame to frame.

**License limit for Viggle-Animate.** Its weights are under the MiniMax H3 Community
License, which does not cover the United States, the European Union, the United Kingdom
or South Korea: running it locally there needs a commercial license from MiniMax. It also
asks for the consent of the people in the clip and an AI-generated label on the output.
Fun Control (Apache 2.0) and SCAIL-2 (MIT) have no such limits. Details in
`../docs/models.md`.

## Stage 2: motion with Viggle-Animate (default)

`editor/stage2_motion_viggle.json`, `api/stage2_motion_viggle.api.json`

Replaces the person in the clip with the person in the approved still. Viggle-Animate
takes the motion, camera and timing from the clip and the identity from the still; in
tests the still's background and body size also carried over, so make the still in the
clip's own framing (see "Stills that work in stage 2"). The clip is converted to 24 fps
(the node pack's **Change Frame Rate**), rendered in 90-frame windows that each start from
the last 5 frames of the window before, and saved at 24 fps with the clip's audio.
Requires the ComfyUI-Viggle-Animate-H3 node pack and the `comfyui-performance-remix`
node pack.

| Input | Meaning |
|---|---|
| Approved still | a stage 1 candidate in the clip's framing, or your own final image |
| Driving clip | the same clip used in stage 1 |
| Clip range | start and duration in seconds; duration 0 keeps the rest of the clip |
| Output size | width and height on the conditioning node, multiples of 32; 704x1248 for 9:16 clips. 0 and 0 use the clip's own size, which for 1080p clips is above the tested 0.4 to 1.2 megapixels |
| Seed | window n uses seed + n |
| Re-render one window | set `rerender_chunk` to its number and a new `rerender_seed`; earlier windows come from the cache |

Output: an MP4 in `output/performance-remix/motion_viggle_*.mp4` at 24 fps, the same
length as the clip range, with its audio.

Measured on a 32 GB GPU: a 6-second clip at 25 fps (150 frames, 144 at 24 fps) rendered
in two windows in 456.6 s, right after a ComfyUI restart; video and audio are both
6.000 s long, and the change between frames at the window boundary is 0.9 to 1.1 times
the change around it.

### API input map

| Node id | Class | Field | Set to |
|---|---|---|---|
| `2` | `LoadImage` | `image` | uploaded approved still |
| `3` | `LoadVideo` | `file` | uploaded driving clip |
| `4` | `Video Slice` | `start_time`, `duration` | clip range in seconds |
| `12` | `ViggleAnimateConditioningWindowed` | `width`, `height` | output size |
| `16` | `ViggleChunkedSampler` | `seed`, `rerender_chunk`, `rerender_seed` | seed, window to re-render |
| `18` | `SaveVideo` | output | the video |

## Stage 2: motion with SCAIL-2

`editor/stage2_motion_scail2.json`, `api/stage2_motion_scail2.api.json`

Replaces the person in the clip with the person in the approved still and keeps the rest
of the clip. SAM 3.1 finds and tracks the person in the clip and in the still from a
short text ("person" by default), and
SCAIL-2 renders the replacement. The node pack's **SCAIL-2: Long Motion Transfer** node
renders the whole clip as a chain of 81-frame pieces in one run; each piece anchors on
the last 5 frames of the one before. The clip's audio is muxed back in. Requires the
`comfyui-performance-remix` node pack.

| Input | Meaning |
|---|---|
| Approved still | a stage 1 candidate, or your own final image |
| Driving clip | the same clip used in stage 1 |
| Clip range | start and duration in seconds; duration 0 keeps the rest of the clip |
| Output size | width and height, multiples of 32; 704x1248 for 9:16 clips |
| Who to replace, who is in the still | SAM 3 text for the clip and for the still |
| Replacement mode | on keeps the clip's background; off animates the still in its own background |
| Prompt | the character, what they do, the place and the camera, in one text |

Output: an MP4 in `output/performance-remix/motion_scail2_*.mp4` at the clip's frame
rate, with its audio.

Measured on a 32 GB GPU: a 6-second clip at 25 fps (150 frames) rendered as pieces
`[81, 77]` in 693.5 s including model loading and SAM 3 tracking; video and audio are
both 6.000 s long, and the change between frames at the join is 0.92 times the change
around it.

### API input map

| Node id | Class | Field | Set to |
|---|---|---|---|
| `2` | `LoadImage` | `image` | uploaded approved still |
| `3` | `LoadVideo` | `file` | uploaded driving clip |
| `4` | `Video Slice` | `start_time`, `duration` | clip range in seconds |
| `6` | `ResizeImageMaskNode` | `resize_type.width`, `resize_type.height` | output size |
| `8` | `CLIPTextEncode` | `text` | who to replace in the clip |
| `9` | `CLIPTextEncode` | `text` | who is in the still |
| `13` | `PrimitiveBoolean` | `value` | replacement mode |
| `19` | `CLIPTextEncode` | `text` | prompt |
| `26` | `PerformanceRemixSCAIL2Long` | `noise_seed` | seed |
| `28` | `SaveVideo` | output | the video |

## Stage 2: motion with Wan2.2 Fun Control

`editor/stage2_motion_fun.json`, `api/stage2_motion_fun.api.json`

The license-free engine with the closest body following. DWPose (body, hands and face) turns the clip into a pose
video at the output size, and Wan2.2 Fun Control animates the approved still with it.
The node pack's **Wan 2.2 Fun Control: Long Motion Transfer** node renders the whole clip
as a chain of 81-frame pieces in one run; each piece starts from the last 5 frames of
the one before, so motion carries across the joins. A face pass with Wan-Animate-2
then re-renders the face with the face reference and blends it back, and the
clip's audio is muxed back in. Requires `comfyui_controlnet_aux` for DWPose.

| Input | Meaning |
|---|---|
| Approved still | a stage 1 candidate, or your own final image; it is used as a reference, not as the first frame |
| Driving clip | the same clip used in stage 1 |
| Clip range | start and duration in seconds; duration 0 keeps the rest of the clip |
| Pose (DWPose), output size | `resolution` is the output's shorter side, 720 by default (576 renders about 1.6 times faster but fur and faces come out soft) |
| Prompt | the character, what they do, the place and the camera, in one text |
| Face reference | an image where the character's face is large and sharp |
| Face appearance prompt, face motion prompt | what the face looks like, and how it moves (Wan-Animate-2 prompts) |
| Face pass on/off | off skips the face pass |
| Face driver | off: the face is re-rendered from the generated video's own face, which keeps the likeness; on: from the clip's face, which copies the facial expressions more closely and keeps less likeness |

Measured on a 32 GB GPU, 11.2-second clip (337 frames), one still, both workflows with
the face pass. Body error is the distance of each joint from the driving clip's joint in
torso lengths (MediaPipe Pose); expression is the correlation of mouth, eye and brow
movement with the driving clip over time (MediaPipe Face Mesh); likeness is the
insightface similarity to the reference photo.

| | Fun Control | Fun Control, face driver on | Wan-Animate-2 |
|---|---|---|---|
| Time, main pass + face pass | 485 + 342 s | 485 + 342 s | 575 + 342 s |
| Output size | 576x1024 | 576x1024 | 480x848 |
| Arm / wrist error | 0.064 / 0.087 | 0.064 / 0.086 | 0.100 / 0.137 |
| Joints within 0.2 torso lengths | 95% | 94% | 88% |
| Expression correlation | 0.09 | 0.37 | 0.36 |
| Likeness | 0.45 | 0.19 | 0.42 |
| Change at the joins over the frames around them | 1.1 to 1.5x | 1.2 to 1.4x | 0.3 to 0.9x |

### API input map

| Node id | Class | Field | Set to |
|---|---|---|---|
| `2` | `LoadImage` | `image` | uploaded approved still |
| `3` | `LoadVideo` | `file` | uploaded driving clip |
| `4` | `Video Slice` | `start_time`, `duration` | clip range in seconds |
| `60` | `DWPreprocessor` | `resolution` | output size (shorter side) |
| `67` | `CLIPTextEncode` | `text` | prompt |
| `68` | `PerformanceRemixFunControlLong` | `noise_seed` | seed |
| `26` | `LoadImage` | `image` | uploaded face reference |
| `29` | `CLIPTextEncode` | `text` | face appearance prompt |
| `30` | `CLIPTextEncode` | `text` | face motion prompt |
| `32` | `PerformanceRemixWanAnimate2Long` | `noise_seed` | face pass seed |
| `34` | `ComfySwitchNode` | `switch` | face pass on or off |
| `51` | `ComfySwitchNode` | `switch` | face driver: false keeps likeness, true copies expressions |
| `24` | `SaveVideo` | output | the video |

### Best for animals: Fun Control with full sampling

`editor/stage2_motion_fun_detail.json`, `api/stage2_motion_fun_detail.api.json`

The same graph and the same inputs as above without the two lightx2v 4-step LoRAs: the
ModelSamplingSD3 nodes read the Fun Control models directly, and the long motion node
samples 20 steps, switches to the low-noise model after step 10 and uses cfg 3.5, the
settings of the Wan2.2 Fun Control template without speed LoRA. With cfg above 1 the
negative prompt (node 18) takes effect.

The 4-step LoRA draws long fur and hair as a fine etched pattern whose sharpness jumps
from frame to frame, most of all in fast moves and at the joins between 81-frame pieces.
Measured on the cat look and the 5-second dance clip at 720x1280, through the same app
script. Sharpness is the Laplacian variance of an 800x450 crop of the cat per frame;
flicker is the mean distance of each frame's sharpness from the mean of its two
neighbours, relative to the median; a jump is a change of more than half the median from
one frame to the next.

| | Fast (4 steps, LoRA) | One 121-frame piece | 121 frames, 6 steps | Best for animals (20 steps) |
|---|---|---|---|---|
| Time for 5 s | 246 s | 319 s | 434 s | 1899 s |
| Sharpness flicker | 0.125 | 0.157 | 0.168 | 0.082 |
| Jumps | 4 | 10 | 12 | 1 |
| Spread (std / median) | 0.43 | 0.41 | 0.38 | 0.32 |
| Median sharpness | 221 | 203 | 185 | 131 |

The 20-step render has the lower median sharpness because the fur is soft and fluffy
instead of etched; in the frames it reads as real fur. Longer pieces or more steps with the
LoRA made the flicker worse. Use it for a final render of a furry or long-haired character,
after the look is settled with Fast.

## Stage 2: object swap with LTX-2.5 inpainting

`editor/stage2_motion_object.json`, `api/stage2_motion_object.api.json`

Replaces one object in the clip, such as a car, a product in a hand or a jacket, with the
object from the approved look, which may have another shape: a camper van for a sedan, a
rubber duck for a bottle. Everything else stays the original footage, including where the
old object's shadow was. Built from Lightricks' `LTX-2.5_ICLoRA_Inpaint_Two_Stage_Distilled`
example with the In/Outpainting IC-LoRA.

One run takes up to 5 seconds of the clip, and the result is exactly as long as the part
it was given. Longer clips are made in windows (see "Long object clips" below).

1. The clip range is cut and padded with its last frame to at least 145 frames and a
   count LTX makes (8k+1) by **Pad Frames for LTX** (node pack). The redraw and the clip
   then have the same frames for the paste-back, and the result is cut back to the clip's
   own frame count before it is saved: 1 s in is 30 frames out, 3 s is 90.
2. The frames are scaled to a short side of 1024 px and cropped to multiples of 64
   (1920x1080 becomes 1792x1024); stage 1 of LTX works at half that size.
3. SAM 3.1 tracks the old object through the clip from a short text ("car"). SAM 3.1
   Detect finds the new object in the look from a few words ("pickup truck"; the app takes
   the head of the description).
4. **Object Area** (node pack) widens the old object's mask so the new object fits: by
   16 px plus a share of the object's height in each frame. The share is how far the new
   object in the look reaches past the old outline, divided by the old object's height,
   kept between 0.2 and 0.6. The margin grows when the object comes closer to the camera,
   and the 0.2 floor covers sides the look does not show, such as a pickup's bed when the
   car turns.
5. SAM 3.1 also tracks heads ("head" and "face", up to four each; "head" alone leaves
   holes in the face and "face" alone misses the hair). Neither the area nor the
   paste-back below widens into them, so a face next to a jacket stays the clip's.
6. The opening frame is the clip's first frame with the look pasted inside that area only.
7. LTX-2.5 (distilled, int8) inpaints the area in two stages: 8 steps at half size, then
   that result scaled up 2x and 2 more steps, cfg 1. The model gets silence as audio. The
   prompt goes to LTX-2.5's own text encoder in ComfyUI; the template's online text-encoder
   and prompt-enhancer branches are removed, so nothing leaves the machine.
8. **Paste Object** (node pack) keeps the clip everywhere except the old object and the
   new one (SAM 3 tracks the new one in the redraw), widened by 24 px. The redraw is
   colour-matched to the clip (median difference in a 24 px band, averaged over 9
   frames) and blended over 4 pyramid levels. The area also takes in nearby patches where
   the blurred redraw differs from the clip by more than 0.06, if they touch the area
   and lie within half its height: the old shadow LTX removed and the new one it drew.
9. The clip's audio is muxed back in.

The app caps object clips at 5 seconds: LTX redraws the whole range in one pass, and the
paste-back holds every frame in memory. Requires the `comfyui-performance-remix` node pack
and ComfyUI-LTXVideo.

How the automatic margin compares with margins picked by hand for seven earlier test
runs (81 frames each), measured on those runs' results: the share of the new object that
falls outside the area, mean over frames and worst frame. "Area" is the automatic area's
size against the hand-picked one.

| Test | Hand margin (stage 1 px) | Share | Outside, hand | Outside, automatic | Area |
|---|---|---|---|---|---|
| Lilac jacket to red biker jacket | 16 | 0.2 (0.11 measured) | 0.1% / 0.2% | 0.0% / 0.0% | 1.96x |
| Silver sedan to green 1970s sedan | 24 | 0.2 (0.10) | 0.0% / 0.2% | 0.0% / 0.0% | 1.42x |
| Leather jacket to camel trench coat | 32 | 0.2 (0.05) | 0.0% / 0.1% | 0.0% / 0.0% | 1.57x |
| Drifting sedan to rally hatchback | 64 | 0.2 (0.05) | 0.0% / 0.0% | 0.0% / 0.0% | 1.00x |
| Bottle to rubber duck | 64 | 0.22 | 0.0% / 0.0% | 0.0% / 0.0% | 1.10x |
| Drifting sedan to pickup truck | 64 | 0.2 (0.03) | 0.0% / 0.2% | 0.0% / 0.4% | 0.96x |
| Silver sedan to camper van | 85 | 0.40 | 0.0% / 0.2% | 0.0% / 0.1% | 1.05x |

Without the 0.2 floor the pickup measured 0.03 (front view in the look) and 19.4% of the
truck fell outside the area on its worst frame, when the car turns and shows its side.

Measured through the web app on a 32 GB GPU (look, then this workflow, 5 seconds of each
clip; times include loading the models after a ComfyUI restart):

| | Silver sedan to camper van | Drifting sedan to pickup truck | Lilac jacket to red biker jacket |
|---|---|---|---|
| Clip | 25 fps, 1080x1920 | 30 fps, 1920x1080 | 25 fps, 1280x720 |
| Output | 1024x1792, 121 frames | 1792x1024, 145 frames | 1792x1024, 121 frames |
| Stage 2 time | 368 s | 388 s | 427 s (with the head trackers) |
| Share | 0.40 | 0.2 (floor) | 0.2 (floor) |

The van run and the pickup run were made before the head trackers were added; those add
about 20 s.

The two other ways to give the new object, through the app on the same machine
(ComfyUI started with `--disable-pinned-memory`):

| | Words plus a reference image | Own first frame (look skipped) |
|---|---|---|
| Swap | silver sedan to "a yellow 1990s pickup truck", reference: a side view of a yellow pickup | bottle in a hand to "a yellow rubber duck", the clip's first frame with a duck in the hand, 1920x1080 |
| Clip | 25 fps, 1080x1920 | 30 fps, 1920x1080 |
| Output | 1024x1792, 121 frames | 1792x1024, 145 frames |
| Time | look 37 s, video 386 s | video 439 s |

- Reference image: the look takes the pickup's colour and its bed, but the reference
  showed only the side, so Qwen kept the old car's front, twin grille included. This run
  was made before the old object was hidden behind a gray shape in the look.
- Own first frame: the video opens with that frame; the duck follows the hand and stands
  on the stand where the bottle was put down, keeping its own shape. ComfyUI's process peaked at 39.0 GB of system RAM, and the whole card was in
use (dynamic VRAM loading stages the 20.5 GB transformer into free GPU memory).

Seen in the results:

- The camper van, taller than the sedan, stays whole through the clip as the car comes
  closer; the road under it is the clip's with the van's own shadow.
- The pickup keeps its bed when the car turns side-on (frame 48), and no outline of the
  old sedan is left behind it; its wheels are slightly soft in the side view.
- The jacket is swapped and the face, smile and hair are the clip's. Without the head
  trackers the face was redrawn: the larger area let LTX change it, and the shadow step
  took the changed face in because it touches the jacket.
- Things held in front of the object are redrawn with it: the flowers in front of the
  jacket come out larger and brighter than in the clip.
- Car looks may copy a well-known design (one van look resembled a classic 1970s
  microbus of a known make). Pick the other look or describe the design more closely.

| Input | Meaning |
|---|---|
| Approved still | the stage 1 candidate with the new object in the clip's first frame |
| Clip | the same clip used in stage 1 |
| Clip range | start and duration in seconds; duration 0 keeps the rest of the clip |
| What to replace in the clip | SAM 3 text, a short noun phrase such as "car", "bottle" or "jacket" |
| The new object | SAM 3 text for the new object, a few words such as "camper van" |
| Prompt | the new object, then "The same scene, camera and light as the rest of the video." |

### API input map

| Node id | Class | Field | Set to |
|---|---|---|---|
| `2004` | `LoadImage` | `image` | approved still |
| `5368` | `LoadVideo` | `file` | uploaded clip |
| `9001` | `Video Slice` | `start_time`, `duration` | clip range in seconds |
| `9102` | `CLIPTextEncode` | `text` | what to replace in the clip |
| `9120` | `CLIPTextEncode` | `text` | the new object |
| `5404` | `PrimitiveStringMultiline` | `value` | prompt |
| `5410:4832` | `RandomNoise` | `noise_seed` | seed (stage 1; stage 2 keeps 42) |
| `9141` | `PerformanceRemixFrameAt` | `seconds` | when the next window starts, from this one's start (0 for one window) |
| `5228` | `SaveVideo` | output | the video |
| `9142` | `SaveImage` | output | the frame the next window starts from |

### Long object clips

`api/join_object_windows.api.json` (used by the app)

One LTX-2.5 pass holds the whole part in memory, so the app makes a clip longer than 5 s in
windows of 5 s that start 4.5 s apart, up to 30 s (7 windows). Each window runs the object
workflow above on its part of the clip. Window 1 opens with the approved look; every later
window opens with the frame the window before it redrew at that time (node `9142`), so the
new object carries over. The join workflow then places the windows on the clip's own frame
times with **Join Object Windows** (node pack), crossfades 8 frames at each join and adds the
clip's audio. Memory stays at one window's size.

Measured on the 7.6-second drift clip ("the car" to "a yellow 1990s pickup truck", 30 fps):
two windows (0 to 5 s and 4.5 to 7.6 s) in 907 s and 555 s, the join in 20 s. The result
has 228 frames, exactly 7.6 s, and the pickup stays through the join: the change between
frames around it (9.1 to 12.5) stays below the clip's median (13.7).

Known limit: when a hand lets go of the object, LTX-2.5 can let the new object fade out as
the hand moves away. On 3 seconds of the bottle clip, 1 of 4 seeds kept the duck on the
stand (1234; 20261029, 7 and 99999 lost it from about 0.8 s). Padding, the clip loader and
the clip length made no difference: the 5-second run that kept it used the one seed that
happened to work there. A prompt line saying the object stays where it is put down saved it
with 1 of the 3 failing seeds and lost it sooner with another, so it was not kept. A
1-second run, where the hand holds the duck throughout, kept it. In the app, a different seed
(Advanced) is the way around it.

| Node id | Class | Field | Set to |
|---|---|---|---|
| `1` | `LoadVideo` | `file` | uploaded clip |
| `2` | `Video Slice` | `start_time`, `duration` | the whole range used |
| `3` | `PerformanceRemixJoinWindows` | `starts` | each window's start, seconds from the range start |
| `11` to `18` | `LoadVideo` | `file` | window 1 to 8; the app deletes the loaders it does not use |
| `3` | `PerformanceRemixJoinWindows` | output | the joined video |

## Finish

`editor/finish.json`, `api/finish.api.json`

Upscales and sharpens a stage 2 video with SeedVR2, applies a light grade, and saves an
H.264 MP4 at CRF 16 with the original audio. It is its own workflow so a finish can be
changed and re-run without rendering the motion again, and it works on output from
either engine. Requires the `comfyui-performance-remix` node pack: its **Streaming
Finish** node runs the official SeedVR2 template's steps one segment at a time and
writes frames straight to the encoder, so memory does not grow with the clip length.

| Setting | Default | Meaning |
|---|---|---|
| scale | 2.0 | 480x848 becomes 960x1696 |
| segment_frames | 49 | frames processed at once; lower it if memory runs out |
| overlap | 4 | frames shared by neighbouring segments, crossfaded |
| color_correction | lab | keeps the colors of the input |
| sharpen, contrast | 0.15, 1.03 | the light grade; 0 and 1.0 give the plain upscale |
| crf | 16 | H.264 quality |
| model | `seedvr2_3b_int8_convrot` | `seedvr2_7b_sharp_int8_convrot` gives smoother lines; see `docs/models.md` |

Measured on a 32 GB GPU with the 3B model:

| Clip | Time | Process RAM | GPU memory reserved |
|---|---|---|---|
| 6 s, 180 frames | 233 s | 8.1 GB | 14.3 GB |
| 11.2 s, 337 frames | 444 s | 8.1 GB | 14.3 GB |

The earlier graph version of this finish held the whole clip in RAM and stalled on the
11-second clip; on the 6-second clip both versions agree within 6% in sharpness.

### API input map

| Node id | Class | Field | Set to |
|---|---|---|---|
| `2` | `LoadVideo` | `file` | uploaded stage 2 video |
| `3` | `UNETLoader` | `unet_name` | SeedVR2 model |
| `5` | `PerformanceRemixStreamingFinish` | `scale`, `color_correction`, `sharpen`, `contrast`, `crf`, `seed` | finish settings |
| `5` | `PerformanceRemixStreamingFinish` | output | the finished video |

## Memory

Measured through the web app on a 32 GB GPU, with ComfyUI started with `--cache-none` so
each node's output is freed once it has been used. "RAM in use" is how far the system's available memory dropped during the job;
"GPU peak" is PyTorch's peak allocation for the job.

Every stage 2 workflow decodes the clip with the node pack's **Clip Frames at Working
Size**, which reads one frame at a time at the size the engine works at. Decoding the clip
at full size and scaling it afterwards (core `GetVideoComponents`) held 3 GB more on an
8-second clip with Fast: 12.4 GB instead of 9.3 GB.

| Choice | Clip | RAM in use | GPU peak |
|---|---|---|---|
| Look (stage 1) | 5 s | 0.6 GB | 2.5 GB |
| Fast | 4 s / 8 s | 7.6 GB / 9.3 GB | 10.1 GB |
| Best for animals (at 2 steps: same models, same memory) | 4 s / 8 s | 6.2 GB / 8.8 GB | 10.8 GB |
| Best for people | 8 s | 9.4 GB (full-size decode) | 2.4 GB |
| Keep background | 8 s | 14.5 GB (full-size decode) | 14.6 GB |
| Object | 3 s / 5 s | 16.7 GB / 22.5 GB | 8.7 GB |

Viggle-Animate's low GPU peak is PyTorch's share only: dynamic loading fills the rest of
the card with model weights outside PyTorch. The object swap does not gain from the
frame-by-frame decode: its peak comes from LTX-2.5 and the paste-back, which hold the whole
clip.

The app's limits (`lib/engines.ts`, `memory`) use RAM in use = base + per clip second, set
at or above every run in this section: Fast and Best for animals 5.1 GB + 0.84 GB, Best for
people 5 GB + 0.76 GB, Keep background 5 GB + 1.26 GB, objects 8.2 GB + 2.86 GB (13 GB +
2.86 GB on a GPU under 24 GB, see below). For Best for
people and Keep background the per-second figure comes from the frames each engine keeps
at 30 fps and is above both 8-second runs. The app also leaves 8 GB free for the system, and
uses the lowest of the four people limits for every people choice, so the clip length depends
on the machine only (Keep background sets it: 15 s with 32 GB of RAM).

ComfyUI's committed memory (what Windows has to back with RAM plus the page file) reached
38 to 51 GB in every run, because model files are mapped and streamed.

For a 24 GB card, a separate process held 8 GB of a 32 GB card, leaving 20.5 GB free, the
same as a 24 GB card with a desktop running. The look, Best for animals at 8 s, Best for
people at 8 s, Keep background at 4 s and 8 s, and the object at 5 s all finished. Not
tested on a real 24 GB card. Other jobs ran in the same queue during those runs, so their
RAM readings are not used above.

For a 16 GB card, the separate process held 16 GB of the 32 GB card, leaving the memory of a
16 GB card. Every choice finished a 2-second and a 5-second clip, and the upscale finished a
2-second clip with its audio (the 2-second object run lost the duck partway, as on the 32 GB
card; see "Long object clips"). ComfyUI ran in its normal cache mode; the 5-second runs ran
alone:

| Choice, 5 s clip | Time | App estimate (32 GB card) | RAM in use | GPU peak |
|---|---|---|---|---|
| Fast | 317 s | 250 s | 8.6 GB | 10.1 GB |
| Best for animals (at 2 steps) | 235 s | | 8.2 GB | 11.7 GB |
| Best for people | 513 s | 375 s | 6.3 GB | 2.4 GB |
| Keep background | 591 s | 575 s | 9.5 GB | 14.6 GB |
| Object | 418 s | 425 s | 24.9 GB | 8.7 GB |

The people engines stay within their limits. The object needs more RAM, because with less
GPU memory more of LTX-2.5 stays in RAM (24.9 GB at 5 s, 18.7 GB at 2 s), so on a GPU under
24 GB the app counts 13 GB instead of 8.2 GB as its base. Not tested on a real 16 GB card.
