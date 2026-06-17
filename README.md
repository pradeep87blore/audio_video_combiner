# Audio Video Combiner

A desktop app that combines primary video clips with an optional semi-transparent overlay and a WAV soundtrack. Output video length matches the WAV duration; primary clips play continuously in random order.

## Requirements

- Node.js 18 or later
- npm

FFmpeg is bundled automatically via `ffmpeg-static` and `ffprobe-static` — no separate FFmpeg install needed.

## Install

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Usage

1. **Primary background** — Choose **Video clips** or **Static images**, then select a folder:
   - **Video clips** — `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`. Clips are shuffled and played back-to-back; when they run out, the list reshuffles and continues until the WAV ends.
   - **Static images** — `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.gif`. Images are shuffled and each is shown for an equal share of the music duration (e.g. 5 images over a 50s track = 10s per image).
2. **Overlay video** (optional) — Select a video to layer on top. Use the transparency slider (0% = fully transparent, 100% = fully opaque).
3. **Intro / Outro** (optional) — Separate video clips played at the start and end. Primary content fills the remaining music duration. Crossfades apply between all segments.
4. **Music (WAV)** — Select a WAV file. The output video duration matches this file.
5. **Output file** — Choose where to save the resulting MP4.
6. Click **Generate Video**.

A **live preview** appears once you select a WAV file and primary media folder. It shows a composited first frame (primary + overlay with transparency) and a timeline scaled to the music length. Moving the overlay transparency slider updates the preview instantly.

**Settings are saved automatically** as you change them and restored on the next launch. Use **Reset / Clear** in the header to start fresh.

Scene changes use a **5-second transition** (2.5s fade to black, then 2.5s fade from black) between clips and images.

## Output

- Format: MP4 (H.264 video, AAC audio)
- Resolution: Canvas sized to the largest width/height among primary clips or images; content is scaled and letterboxed to fit
- Frame rate: 30 fps for image slideshows; for video clips, 30 fps unless all clips share the same fps
- **Hardware encoding**: Set **Video encoding** to Auto (default) to use NVIDIA NVENC, Intel Quick Sync, or AMD AMF when available. GPU speeds up encoding; scaling/fades/overlay still use the CPU.

## Notes

- Processing time depends on clip count, resolution, and output duration.
- Intermediate files are written to a temp directory and cleaned up automatically.
- The npm install includes platform-specific FFmpeg binaries (~70 MB).
