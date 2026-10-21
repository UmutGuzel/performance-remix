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
CFGNorm 1, reference latents method `index_timestep_zero`. Measured on an RTX 5090:
four 752x1392 candidates in 37.5 s with the text encoder already loaded.

## Generation: Wan-Animate-2 (Character, World and Style modes)

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

## Object mode: Wan2.2-Animate 14B

Used because its node `WanAnimateToVideo` takes `background_video` and
`character_mask`, which Wan-Animate-2 does not. License: Apache 2.0.
Guide: https://docs.comfy.org/tutorials/video/wan/wan2-2-animate

| ComfyUI folder | File | Size | Notes |
|---|---|---|---|
| diffusion_models | `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors` | see repo | https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled, folder `Wan22Animate` |
| diffusion_models | `wan2.2_animate_14B_bf16.safetensors` | see repo | https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| vae | `wan_2.1_vae.safetensors` | about 0.25 GB | same repo |

Text encoder, clip vision and the lightx2v LoRA are shared with Wan-Animate-2.
Custom nodes: `comfyui_controlnet_aux` (DWPose Estimator) and `ComfyUI-KJNodes`
(Points Editor).

## Alternative generation backbone: LTX-2.5

License: LTX-2.x Community License. Free commercial use for entities under 10 million
USD yearly revenue; above that a paid agreement is required. The Hugging Face repo is
gated: accept the license and wait for approval before downloading.
Repo: https://huggingface.co/Lightricks/LTX-2.5
Guide: https://docs.comfy.org/tutorials/video/ltx/ltx-2-5 (ComfyUI 0.32 or newer)

| ComfyUI folder | File | Size |
|---|---|---|
| diffusion_models | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | see repo |
| text_encoders | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | see repo |
| vae | `ltx-2.5-video-vae-bf16.safetensors` | see repo |
| vae | `ltx-2.5-audio-vae-bf16.safetensors` | see repo |
| latent_upscale_models | `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` | see repo |

IC-LoRA adapters (Union Control for pose, depth and canny; Ingredients for reference
sheets; In/Outpaint for masked regions) are listed per workflow in the "Model Links"
note of each graph in
https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5.

## Finish: SeedVR2

Video super-resolution, native in ComfyUI. License: Apache 2.0.
Guide and files: https://docs.comfy.org/tutorials/utility/seedvr2
Sizes 3B and 7B, in FP16, FP8, INT8, NVFP4 and MXFP8. Use a batch size of at least 5
frames so the temporal consistency path is active.

## Masks and control

| Purpose | Model | License |
|---|---|---|
| Person and object masks | SAM2 | Apache 2.0 |
| Depth control | Depth Anything V2 Small or Base | Apache 2.0 (the Large checkpoint is CC BY-NC 4.0, do not ship it) |
| Pose control | DWPose through `comfyui_controlnet_aux` | Apache 2.0 |

## VRAM notes

- Wan-Animate-2 int8 at 832x480, 81 frames per window: target is a 24 GB card with the
  cache node on CPU. 720p needs 32 GB or model offloading. The upstream repository tuned
  its defaults for 8x A800; the ComfyUI int8 build is the consumer path.
- LTX-2.5: no official VRAM figures. The 22B int8 transformer plus the 12B int8 text
  encoder need offloading on 24 GB cards.
- SeedVR2 7B: 24 GB minimum for video batches, 32 GB comfortable.
