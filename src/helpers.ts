
import { IFileInfo } from "./dto"

const waitingPromises: Map<string, PromiseWithResolvers<IFileInfo>> = new Map()

export async function waitForVideo(url: string): Promise<IFileInfo> {
    const existingPromise = waitingPromises.get(url)
    if (existingPromise) return existingPromise.promise

    const newPromise = Promise.withResolvers<IFileInfo>()
    waitingPromises.set(url, newPromise)
    return newPromise.promise
}

export async function resolveVideo(url: string, fileId?: IFileInfo, error?: string) {
    console.log(url, fileId)
    const p = waitingPromises.get(url)
    if (!p) return console.warn("No promise to resolve")
    if (fileId) p.resolve(fileId)
    else p.reject(error)

    waitingPromises.delete(url)
}