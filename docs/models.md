# Models

Every file a workflow loads, where to get it, how big it is and under which license.
Sizes are as listed on the Hugging Face file pages on 2026-10-19; "see repo" means the
page does not show one. Weights are never committed to this repository.

Place files in the ComfyUI folder named in each table.

## Stage 1, look: Qwen-Image-Edit 2511

License: Apache 2.0 for the model, the Lightning LoRA and the Qwen2.5-VL text encoder.
Source model: https://huggingface.co/Qwen/Qwen-Image-Edit-2511

| ComfyUI folder | File | Size | Source |
|---|---|---|---|
| diffusion_models | `qwen_image_edit_2511_fp8mixed.safetensors` | 20.5 GB | https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI, folder `split_files/diffusion_models` |
| text_encoders | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | 9.4 GB | https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI, folder `split_files/text_encoders` |
| vae | `qwen_image_vae.safetensors` | 0.25 GB | same repo, folder `split_files/vae` |
| loras | `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | 0.85 GB | https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning |

Settings: 4 steps, euler, simple scheduler, cfg 1, ModelSamplingAuraFlow shift 3.1,
CFGNorm 1, reference latents method `index_timestep_zero`. Measured on a 32 GB GPU:
four 752x1392 candidates in 37.5 s with the text encoder already loaded.

## Generation, default: Viggle-Animate (MiniMax H3)

Viggle-Animate is a 33.1 B finetune of MiniMax H3's reference-to-video model for
replacing the person in a clip. Source model: https://huggingface.co/Viggle/Viggle-Animate
ComfyUI files: https://huggingface.co/drbaph/Viggle-Animate-ComfyUI
Nodes: https://github.com/Saganaki22/ComfyUI-Viggle-Animate-H3 (Apache 2.0, tested at
commit 6ae081a), cloned into `ComfyUI/custom_nodes`.

License: MiniMax H3 Community License (https://huggingface.co/MiniMaxAI/MiniMax-H3). It
allows commercial use for products under 20 million USD yearly revenue, but it does not
cover the United States, the European Union, the United Kingdom or South Korea: running
H3 or Viggle-Animate locally there needs a commercial license from MiniMax (Comfy resells
it, https://comfy.org/minimax/license). It also requires the consent of people shown in
the input and a label that the output is AI-generated. If any of this rules it out, use
Fun Control or SCAIL-2 below.

| ComfyUI folder | File | Size | Source |
|---|---|---|---|
| diffusion_models | `minimax_h3_ref2va_viggle_pruned_int8_convrot.safetensors` | 21.03 GB | drbaph repo, folder `diffusion_models` |
| loras | `viggle_animate_dmd_lora.safetensors` | 3.77 GB | same repo, folder `loras`; the few-step LoRA used by the workflow |
| loras | `viggle_animate_dmd_lora_r64.safetensors` | 0.94 GB | optional, rank-64 version |
| text_cond | `fixed_embed_fwd_anyframe.safetensors` | 4 MB | same repo, folder `text_cond`; replaces the text encoder |
| vae | `minimax_h3_video_vae_int8_convrot.safetensors` | 2.81 GB | https://huggingface.co/Comfy-Org/MiniMax-H3, folder `vae`; the fp16 VAE (5.21 GB) gave the same faces |

Settings: `MiniMaxH3SigmaShift` 3 / 3, BasicGuider, euler, 6 sigma points (`1.0, 0.923,
0.818, 0.667, 0.429, 0.0`), 704x1248 for 9:16 clips, 90-frame windows with a 5-frame
anchor between them, driving clip at 24 fps. At 512x896 the faces came out uneven; at
704x1248 they are clean. The model is streamed from system RAM at every step (about 34 s
per step at 704x1248 on a 32 GB GPU, with the card at 99 to 100% use). After other large
models (SeedVR2, Qwen) the first window can run 5 times slower; run all Viggle renders
before the finish.

## Generation, license-free: Wan2.2 Fun Control A14B

License: Apache 2.0. Source model: https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control
ComfyUI repack: https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged

| ComfyUI folder | File | Size | Notes |
|---|---|---|---|
| diffusion_models | `wan2.2_fun_control_high_noise_14B_fp8_scaled.safetensors` | 14.3 GB | `split_files/diffusion_models` |
| diffusion_models | `wan2.2_fun_control_low_noise_14B_fp8_scaled.safetensors` | 14.3 GB | same folder |
| loras | `wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors` | 1.23 GB | `split_files/loras`; 4-step sampling |
| loras | `wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors` | 1.23 GB | same folder |

Text encoder (`umt5_xxl_fp8_e4m3fn_scaled`) and the Wan 2.1 VAE are shared with
Wan-Animate-2. Settings, as in the official 4-step template: 4 steps, switch to the
low-noise model after step 2, euler, simple scheduler, cfg 1, ModelSamplingSD3 shift 8.
The "Best for animals" workflow (`stage2_motion_fun_detail`) does not load the two LoRAs: 20
steps, switch after step 10, cfg 3.5, the rest the same.
Trained on 81 frames at 16 fps and 512 to 1024 px. Pose comes from DWPose through
`comfyui_controlnet_aux`. The face pass of this workflow uses Wan-Animate-2 below.

## Generation, license-free: SCAIL-2

Wan 2.1 14B finetune for character animation and replacement. License: MIT.
Source model: https://huggingface.co/zai-org/SCAIL-2
ComfyUI repack: https://huggingface.co/Comfy-Org/SCAIL-2

| ComfyUI folder | File | Size | Source |
|---|---|---|---|
| diffusion_models | `wan2.1_14B_SCAIL_2_int8_convrot.safetensors` | 16.65 GB | Comfy-Org repo, folder `diffusion_models` |
| loras | `wan2.1_SCAIL_2_DPO_lora_bf16.safetensors` | 1.23 GB | same repo, folder `loras` |
| checkpoints | `sam3.1_multiplex_fp16.safetensors` | 1.75 GB | https://huggingface.co/Comfy-Org/sam3.1, folder `checkpoints`; finds and tracks the person |

SAM 3.1 is under Meta's SAM License: worldwide and royalty-free, with trade-control
conditions and a copy of the license required when redistributing it. The text encoder
(`umt5_xxl_fp8_e4m3fn_scaled`), `clip_vision_h`, the Wan 2.1 VAE and the lightx2v rank-64
LoRA are shared with Wan-Animate-2. Settings, as in the official
`video_wan21_scail2_character_replacement_int8` template with its turbo preset: DPO LoRA
1.0, lightx2v LoRA 0.8, 6 steps, euler, simple scheduler, cfg 1, ModelSamplingSD3 shift
5, replacement mode, 81-frame pieces with a 5-frame anchor.

## Face pass: Wan-Animate-2

License: Apache 2.0. Source model: https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B
ComfyUI repack: https://huggingface.co/Comfy-Org/Wan-Animate-2

| ComfyUI folder | File | Size | Notes |
|---|---|---|---|
| diffusion_models | `wan_animate_2_int8_convrot.safetensors` | 16.7 GB | default, 24 GB cards |
| diffusion_models | `wan_animate_2_distill_int8_convrot.safetensors` | 16.7 GB | distilled, fewer steps |
| diffusion_models | `wan_animate_2_bf16.safetensors` | 32.8 GB | full precision |
| diffusion_models | `wan_animate_2_distill_bf16.safetensors` | 32.8 GB | full precision, distilled |
| text_encoders | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | about 6.7 GB | from https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged |
| clip_vision | `clip_vision_h.safetensors` | about 1.3 GB | same repo |
| vae | `Wan2_1_VAE_bf16.safetensors` | see repo | `vae/` folder of the Comfy-Org repack |
| loras | `lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors` | see repo | https://huggingface.co/Kijai/WanVideo_comfy, folder `Lightx2v`; enables 4 to 6 step sampling |

Reference workflow: `video_wan_animate2.json` in
https://github.com/Comfy-Org/workflow_templates. Core nodes `WanAnimate2ToVideo` and
`WanAnimate2Cache`. Set the cache node's device to `cpu` to avoid VRAM spikes. Template
sampling: 6 steps, LCM sampler, simple scheduler, cfg 1, ModelSamplingSD3 shift 5.

## Object swap: LTX-2.5 inpainting

License: LTX-2.x Community License. Free commercial use for entities under 10 million
USD yearly revenue; above that a paid agreement is required. The Hugging Face repos are
gated: accept the license on each page and wait for approval, then download with a
Hugging Face token.
Repo: https://huggingface.co/Lightricks/LTX-2.5
Guide: https://docs.comfy.org/tutorials/video/ltx/ltx-2-5 (ComfyUI 0.32 or newer)

| ComfyUI folder | File | Size |
|---|---|---|
| diffusion_models | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | 21.5 GB |
| text_encoders | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | 15.4 GB |
| vae | `ltx-2.5-video-vae-bf16.safetensors` | 1.5 GB |
| vae | `ltx-2.5-audio-vae-bf16.safetensors` | 0.36 GB |
| loras | `ltx-2.3-22b-ic-lora-in-outpainting-0.9.safetensors` | 1.31 GB, from https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-In-Outpainting |

Sizes in this table are the downloaded file sizes. SAM 3.1 from the SCAIL-2 section finds
the old and the new object. The workflow (`stage2_motion_object`) is built from
`LTX-2.5_ICLoRA_Inpaint_Two_Stage_Distilled` in
https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5.

## Finish: SeedVR2

Video super-resolution, native in ComfyUI. License: Apache 2.0.
Guide: https://docs.comfy.org/tutorials/utility/seedvr2
Files: https://huggingface.co/Comfy-Org/SeedVR2

| ComfyUI folder | File | Size | Notes |
|---|---|---|---|
| diffusion_models | `seedvr2_3b_int8_convrot.safetensors` | 3.5 GB | default in the finish workflow |
| diffusion_models | `seedvr2_7b_sharp_int8_convrot.safetensors` | 8.3 GB | optional, more detail, slower |
| vae | `seedvr2_ema_vae_fp16.safetensors` | 0.5 GB | shared by all variants |

Settings: one step, euler, simple scheduler, `lab` color correction. The finish workflow
runs these steps through the node pack's Streaming Finish, 49 frames per segment with a
4-frame crossfade: an 11.2-second clip (337 frames) took 444 s with 8.1 GB of process RAM
and 14.3 GB of GPU memory reserved.

The measurements below come from the earlier graph version of the finish, which held
the whole clip in memory.

Measured on a 32 GB GPU, 6-second clip, 480x848 to 960x1696, 3B int8: 241 s,
20.5 GB reserved by the workflow. Edge sharpness (variance of the Laplacian) rose from
76 for a plain lanczos 2x resize to 642, with contrast and saturation unchanged. The
light grade after it (sharpen alpha 0.15, contrast 1.03) raises sharpness to 2,307 and
contrast by 6%.

The 7B sharp int8 model on the same clip with the same grade: 185 s, 20.2 GB reserved,
sharpness 1,134 against 2,307 for the 3B, same contrast and color. On this anime test
the 3B gives crisper outlines and the 7B smoother ones; real camera footage is not
compared yet.

## Masks and control

| Purpose | Model | License |
|---|---|---|
| Person and object masks (SCAIL-2, object engine) | SAM 3.1 | SAM License |
| Pose control (Fun Control) | DWPose through `comfyui_controlnet_aux` | Apache 2.0 |

## VRAM notes

- Wan-Animate-2 int8 at 480x848, 81 frames per piece, cache on GPU: the workflow
  reserved 18.6 GB of GPU memory at peak (14.9 GB in live tensors) on a 32 GB GPU;
  total card use reached 30.6 GB including other apps and models cached from earlier
  runs. Chaining pieces keeps the peak
  at one piece's size. Rendering a whole 625-frame clip in one context-window pass
  instead filled the 32 GB card and did not finish in 20 minutes. On 24 GB cards set
  the cache to CPU (not tested).
- SeedVR2 7B: 24 GB minimum for video batches, 32 GB comfortable.
- Object swap (LTX-2.5 inpainting, int8, 1792x1024, 121 to 145 frames): the whole card
  in use, because ComfyUI's dynamic VRAM loading stages the 20.5 GB transformer into the
  free memory; PyTorch reserved 9.8 GB at peak, and ComfyUI's process peaked at 39.0 GB
  of system RAM. With 8 GB or 16 GB of the card held by another process (the memory of a
  24 GB or a 16 GB card), a 5-second object swap still finished: dynamic loading streams the
  weights from RAM. Not tested on real 24 GB or 16 GB cards. Memory per engine and clip length is in
  `workflows/README.md`, "Memory".
