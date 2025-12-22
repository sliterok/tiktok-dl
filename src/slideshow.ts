import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

async function getAudioDurationSeconds(path: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ]);

        let stdout = "";
        let stderr = "";

        ffprobe.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        ffprobe.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        ffprobe.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `ffprobe exited with code ${code}`));
                return;
            }
            const duration = parseFloat(stdout.trim());
            if (!Number.isFinite(duration)) {
                reject(new Error("Unable to parse audio duration"));
                return;
            }
            resolve(duration);
        });

        ffprobe.on("error", reject);
    });
}

export async function mergePhotosWithMusic(
    photos: ArrayBuffer[],
    music: ArrayBuffer,
    secondsPerFrame = 5
): Promise<Buffer> {
    if (photos.length === 0) {
        throw new Error("No photos provided");
    }
    if (secondsPerFrame <= 0) {
        throw new Error("secondsPerFrame must be > 0");
    }

    const tempDir = await mkdtemp(join(tmpdir(), "tiktok-slideshow-"));

    try {
        await Promise.all(
            photos.map((photo, index) =>
                writeFile(
                    join(tempDir, `frame_${String(index).padStart(4, "0")}.jpg`),
                    Buffer.from(photo)
                )
            )
        );

        const musicPath = join(tempDir, "music.mp3");
        await writeFile(musicPath, Buffer.from(music));

        const outputPath = join(tempDir, "slideshow.mp4");

        const frameCount = photos.length;
        const framesDuration = frameCount * secondsPerFrame;
        const audioDuration = await getAudioDurationSeconds(musicPath);

        const targetDuration = Math.max(framesDuration, audioDuration);

        let padVideoSeconds = targetDuration - framesDuration;
        let padAudioSeconds = targetDuration - audioDuration;

        const epsilon = 1e-2;
        if (Math.abs(padVideoSeconds) < epsilon) padVideoSeconds = 0;
        if (Math.abs(padAudioSeconds) < epsilon) padAudioSeconds = 0;

        const inputFramerate = `1/${secondsPerFrame}`;

        const ffmpegArgs: string[] = [
            "-y",
            "-start_number", "0",
            "-framerate", inputFramerate,
            "-i", join(tempDir, "frame_%04d.jpg"), // 0:v
            "-i", musicPath,                       // 1:a
        ];

        if (padVideoSeconds > 0 && padAudioSeconds === 0) {
            ffmpegArgs.push(
                "-filter_complex",
                `[0:v]tpad=stop_mode=clone:stop_duration=${padVideoSeconds}[v]`,
                "-map", "[v]",
                "-map", "1:a"
            );
        } else if (padAudioSeconds > 0 && padVideoSeconds === 0) {
            ffmpegArgs.push(
                "-filter_complex",
                `[1:a]apad=pad_dur=${padAudioSeconds}[a]`,
                "-map", "0:v",
                "-map", "[a]"
            );
        } else {
            ffmpegArgs.push(
                "-map", "0:v",
                "-map", "1:a"
            );
        }

        ffmpegArgs.push(
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-r", "30",
            "-c:a", "aac",
            outputPath
        );

        await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: "ignore" });
            ffmpeg.on("error", reject);
            ffmpeg.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ffmpeg exited with code ${code}`));
                }
            });
        });

        return await readFile(outputPath);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}
