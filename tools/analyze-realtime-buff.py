#!/usr/bin/env python3
"""Locate and benchmark a HUD buff template in a gameplay recording.

This diagnostic intentionally uses the system FFmpeg and Python image stack so
the large source video never becomes a project fixture or runtime dependency.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.feature import match_template
from skimage.transform import resize


@dataclass(frozen=True)
class VideoSpec:
    width: int
    height: int
    duration: float
    fps: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("template", type=Path)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument("--fps", type=float, default=2.0)
    parser.add_argument("--analysis-width", type=int, default=864)
    parser.add_argument("--template-scales", default="0.52,0.56,0.60,0.64,0.68")
    parser.add_argument("--realtime", action="store_true")
    parser.add_argument("--stop-on-detection", action="store_true")
    parser.add_argument("--activation-threshold", type=float, default=0.92)
    parser.add_argument("--top", type=int, default=16)
    parser.add_argument("--json", type=Path)
    return parser.parse_args()


def probe_video(ffmpeg: Path, video: Path) -> VideoSpec:
    command = [str(ffmpeg), "-hide_banner", "-i", str(video)]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    output = result.stderr
    import re

    duration_match = re.search(r"Duration:\s*(\d+):(\d+):([0-9.]+)", output)
    video_match = re.search(r"Video:.*?,\s*(\d+)x(\d+).*?,\s*([0-9.]+) fps", output)
    if not duration_match or not video_match:
        raise RuntimeError("Could not read video metadata from FFmpeg")
    hours, minutes, seconds = duration_match.groups()
    width, height, fps = video_match.groups()
    return VideoSpec(
        width=int(width),
        height=int(height),
        duration=int(hours) * 3600 + int(minutes) * 60 + float(seconds),
        fps=float(fps),
    )


def decoded_frames(ffmpeg: Path, video: Path, width: int, height: int, fps: float, realtime: bool = False):
    command = [
        str(ffmpeg), "-hide_banner", "-loglevel", "error",
    ]
    if realtime:
        command.append("-re")
    command += [
        "-i", str(video),
        "-vf", f"fps={fps},scale={width}:{height}:flags=bilinear",
        "-an", "-sn", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout is not None
    frame_size = width * height * 3
    index = 0
    try:
        while True:
            data = process.stdout.read(frame_size)
            if len(data) != frame_size:
                break
            frame = np.frombuffer(data, dtype=np.uint8).reshape((height, width, 3))
            yield index / fps, frame
            index += 1
    finally:
        process.stdout.close()
        stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
        try:
            return_code = process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.terminate()
            return_code = process.wait(timeout=2)
        if return_code and stderr:
            print(stderr, file=sys.stderr)


def rgb_to_luma(rgb: np.ndarray) -> np.ndarray:
    # match_template's local variance subtraction can lose enough precision on
    # tiny, low-contrast HUD icons for float32 scores to escape [-1, 1].
    rgb_float = rgb.astype(np.float64) / 255.0
    return rgb_float[..., 0] * 0.2126 + rgb_float[..., 1] * 0.7152 + rgb_float[..., 2] * 0.0722


def signature(rgb: np.ndarray, size: int = 24) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    sampled = resize(rgb, (size, size, 3), order=1, preserve_range=True, anti_aliasing=True).astype(np.float32)
    red, green, blue = sampled[..., 0], sampled[..., 1], sampled[..., 2]
    luma_raw = red * 0.2126 + green * 0.7152 + blue * 0.0722
    deviation = max(8.0, float(luma_raw.std()))
    luma = np.clip((luma_raw - luma_raw.mean()) / deviation, -3, 3)
    edge = np.zeros_like(luma)
    edge[:, :-1] += np.abs(luma_raw[:, :-1] - luma_raw[:, 1:]) / 160
    edge[:-1, :] += np.abs(luma_raw[:-1, :] - luma_raw[1:, :]) / 160
    edge = np.clip(edge, 0, 1)
    total = np.maximum(24, red + green + blue)
    return luma.ravel(), edge.ravel(), (red / total).ravel(), (green / total).ravel()


def vector_correlation(left: np.ndarray, right: np.ndarray) -> float:
    denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denominator < 0.0001:
        return 0.0
    return max(0.0, min(1.0, (float(np.dot(left, right)) / denominator + 1) / 2))


def signature_similarity(left, right) -> float:
    structure = vector_correlation(left[0], right[0])
    edges = vector_correlation(left[1], right[1])
    chroma_difference = float(np.abs(left[2] - right[2]).sum() + np.abs(left[3] - right[3]).sum())
    color = max(0.0, min(1.0, 1 - chroma_difference / (left[2].size * 1.05)))
    return max(0.0, min(1.0, structure * 0.52 + edges * 0.28 + color * 0.2))


def main() -> int:
    args = parse_args()
    spec = probe_video(args.ffmpeg, args.video)
    analysis_width = min(spec.width, max(320, args.analysis_width))
    analysis_height = round(spec.height * analysis_width / spec.width)
    if analysis_height % 2:
        analysis_height += 1
    template_rgb = np.asarray(Image.open(args.template).convert("RGB"))
    scale = analysis_width / spec.width
    template_scales = [float(value) for value in args.template_scales.split(",") if value.strip()]
    scaled_templates = []
    for template_scale in template_scales:
        scaled_template = resize(
            template_rgb,
            (
                max(8, round(template_rgb.shape[0] * scale * template_scale)),
                max(8, round(template_rgb.shape[1] * scale * template_scale)),
                3,
            ),
            order=1,
            preserve_range=True,
            anti_aliasing=True,
        ).astype(np.uint8)
        scaled_templates.append((template_scale, scaled_template, rgb_to_luma(scaled_template)))

    # Buff icons occupy the lower HUD. Keeping the search broad enough for UI
    # scaling still removes most combat effects and cuts matching cost sharply.
    x0, x1 = round(analysis_width * 0.35), round(analysis_width * 0.65)
    y0, y1 = round(analysis_height * 0.85), round(analysis_height * 0.92)
    candidates: list[dict] = []
    processed = 0
    matching_seconds = 0.0
    started = time.perf_counter()
    consecutive_hits = 0
    first_detection = None
    for timestamp, frame in decoded_frames(args.ffmpeg, args.video, analysis_width, analysis_height, args.fps, args.realtime):
        search_rgb = frame[y0:y1, x0:x1]
        search_luma = rgb_to_luma(search_rgb)
        match_started = time.perf_counter()
        best_match = None
        for template_scale, scaled_template, template_luma in scaled_templates:
            response = match_template(search_luma, template_luma, pad_input=False)
            flat_index = int(np.argmax(response))
            local_y, local_x = np.unravel_index(flat_index, response.shape)
            ncc = float(response[local_y, local_x])
            if best_match is None or ncc > best_match[0]:
                best_match = (ncc, local_y, local_x, template_scale, scaled_template)
        assert best_match is not None
        ncc, local_y, local_x, template_scale, scaled_template = best_match
        candidate_rgb = search_rgb[
            local_y:local_y + scaled_template.shape[0],
            local_x:local_x + scaled_template.shape[1],
        ]
        visual = signature_similarity(signature(candidate_rgb), signature(scaled_template))
        matching_seconds += time.perf_counter() - match_started
        score = ncc * 0.72 + visual * 0.28
        item = {
            "timestamp": timestamp,
            "score": score,
            "ncc": ncc,
            "visual": visual,
            "templateScale": template_scale,
            "x": (x0 + local_x) / scale,
            "y": (y0 + local_y) / scale,
            "width": scaled_template.shape[1] / scale,
            "height": scaled_template.shape[0] / scale,
        }
        candidates.append(item)
        candidates.sort(key=lambda entry: entry["score"], reverse=True)
        del candidates[args.top:]
        processed += 1
        if score >= args.activation_threshold:
            consecutive_hits += 1
        else:
            consecutive_hits = 0
        strong_match = score >= min(0.99, args.activation_threshold + 0.025)
        if first_detection is None and (strong_match or consecutive_hits >= 2):
            first_detection = {
                **item,
                "wallSeconds": time.perf_counter() - started,
                "consecutiveHits": consecutive_hits,
                "strongMatch": strong_match,
            }
            if args.stop_on_detection:
                break

    elapsed = time.perf_counter() - started
    result = {
        "video": {
            "width": spec.width,
            "height": spec.height,
            "fps": spec.fps,
            "duration": spec.duration,
        },
        "analysis": {
            "fps": args.fps,
            "width": analysis_width,
            "height": analysis_height,
            "frames": processed,
            "wallSeconds": elapsed,
            "matchingMillisecondsPerFrame": matching_seconds * 1000 / max(1, processed),
            "throughputFps": processed / max(0.001, elapsed),
            "realtime": args.realtime,
        },
        "firstDetection": first_detection,
        "candidates": candidates,
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    print(rendered)
    if args.json:
        args.json.write_text(rendered + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
