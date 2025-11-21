import { inspect } from 'util';
import { Downloader } from "@tobyg74/tiktok-api-dl";

export async function downloadVideo(url: string): Promise<{
    video?: ArrayBuffer;
    photos?: ArrayBuffer[];
    music?: ArrayBuffer
} | undefined> {
    const response = await Downloader(url, {
        version: "v2",
    });

    const videoUrl = response.result?.video?.playAddr?.[0];

    if (videoUrl) {
        const video = await fetch(videoUrl);
        if (!video.body) {
            console.log(video)
            console.warn("No body in TikTok response")
            return
        }

        return { video: await video.arrayBuffer() }
    }

    const photoUrls = response.result?.images
    if (photoUrls?.length) {
        const photos: ArrayBuffer[] = []
        for (const photoUrl of photoUrls) {
            const photo = await fetch(photoUrl);
            if (!photo.body) {
                console.warn("No body in TikTok response")
            } else {
                photos.push(await photo.arrayBuffer())
            }
        }

        const musicUrl = response.result?.music?.playUrl?.[0]
        let music: ArrayBuffer | undefined
        if (musicUrl) {
            const musicRes = await fetch(musicUrl)
            music = await musicRes.arrayBuffer()
        }
        return { photos, music }
    }

    console.warn("TikTok Video not found", inspect(response, false, Infinity))
}
