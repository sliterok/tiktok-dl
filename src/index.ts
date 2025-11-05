import 'dotenv/config'
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { createInterface } from "readline";
import { Bot, InputFile } from "grammy";
import { CustomFile } from 'telegram/client/uploads';
import { downloadVideo } from './downloader';
import { waitForVideo, resolveVideo } from './helpers';
import { inspect } from 'util';
import { run } from "@grammyjs/runner";

const bot = new Bot(process.env.TG_BOT_TOKEN!);
const apiId = Number(process.env.TG_API_ID ?? 0);
const apiHash = process.env.TG_API_HASH ?? "";
const stringSession = new StringSession(process.env.TG_SESSION ?? "");
const allowList = process.env.TG_USER_ALLOWLIST!.split(',').map(userId => parseInt(userId))

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
        if (!allowList.includes(ctx.message.from.id)) {
            return ctx.reply("Self host yourself at https://github.com/sliterok/tiktok-dl")
        }

        const text = ctx.message.text
        if (!text.startsWith("https://")) return

        ctx.reply('Downloading...')
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

async function sendVideo(ab: ArrayBuffer, caption: string) {
    const buffer = Buffer.from(ab)
    const file = new CustomFile("video.mp4", buffer.length, '', buffer); // Or path to file
    const target = await client.getInputEntity('@free_tiktok_downloaderbot')

    client.sendFile(target, { file, caption })
}

initTg()