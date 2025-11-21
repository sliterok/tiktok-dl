import 'dotenv/config'
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { createInterface } from "readline";
import { Bot, InputFile } from "grammy";
import { CustomFile } from 'telegram/client/uploads.js';
import { downloadVideo } from './downloader';
import { waitForVideo, resolveVideo } from './helpers';
import { inspect } from 'util';
import { run } from "@grammyjs/runner";

const bot = new Bot(process.env.TG_BOT_TOKEN!);
const apiId = Number(process.env.TG_API_ID ?? 0);
const apiHash = process.env.TG_API_HASH ?? "";
const stringSession = new StringSession(process.env.TG_SESSION ?? "");

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

export async function initTg() {
    await client.start({
        phoneNumber: async () =>
            new Promise((resolve) =>
                rl.question("Please enter your number: ", resolve)
            ),
        password: async () =>
            new Promise((resolve) =>
                rl.question("Please enter your password: ", resolve)
            ),
        phoneCode: async () =>
            new Promise((resolve) =>
                rl.question("Please enter the code you received: ", resolve)
            ),
        onError: (err) => console.log(err),
    });

    const me = await bot.api.getMe()

    async function sendVideo(ab: ArrayBuffer, caption: string) {
        const buffer = Buffer.from(ab)
        const file = new CustomFile("video.mp4", buffer.length, '', buffer);
        const target = await client.getInputEntity('@' + me.username)

        client.sendFile(target, { file, caption })
    }

    bot.on('message:video', async (ctx) => {
        console.log(inspect(ctx, { depth: null }))
        const caption = ctx.message.caption
        if (!caption) return

        resolveVideo(caption, {
            fileId: ctx.message.video.file_id,
            chatId: ctx.message.chat.id,
            messageId: ctx.message.message_id
        })
    })

    bot.on('message:text', async (ctx) => {
        const text = ctx.message.text
        if (!text.startsWith("https://")) return

        await ctx.replyWithChatAction("upload_video")
        const download = await downloadVideo(text)
        if (!download) return

        const { video, photos, music } = download

        if (video) {
            const promise = waitForVideo(text)
            await sendVideo(video, text)

            const fileInfo = await promise
            await ctx.replyWithVideo(fileInfo.fileId)
            await bot.api.deleteMessage(fileInfo.chatId, fileInfo.messageId)
        } else if (photos) {
            await ctx.replyWithMediaGroup(photos?.map(p => ({ type: "photo", media: new InputFile(Buffer.from(p)) })))
            if (music) {
                await ctx.replyWithAudio(new InputFile(Buffer.from(music)))
            }
        }
    })

    run(bot)
}

initTg()