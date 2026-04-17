import { invoke } from "@tauri-apps/api/core"

export const useFileHandler = () => {

    const writeFile = async (path: string, data: Uint8Array): Promise<boolean> => {
        await invoke('write_file', { path, data })
        return true
    }

    const readExact = async (path: string, length: number): Promise<Uint8Array<ArrayBuffer>> =>
        new Uint8Array(await invoke<number[]>('read_file_bytes', { path, length }))

    const readFile = async (path: string) => new Uint8Array(await invoke<number[]>('read_file', { path }))
    const readFileText = async (path: string) => new TextDecoder().decode(new Uint8Array(await invoke<number[]>('read_file', { path })))

    const canWrite = async (path: string, password: string) => {
        let result
        try {
            // @ts-ignore
            const res = await readExact(path, 29).toBase64()
            // Probably Empty
            if (res.startsWith('AAAAAAAAAAAAAAAAAAAAAAA')) return true

            // @ts-ignore
            result = Uint8Array.fromBase64(res.toBase64())
        } catch {
            // Probably file does not exist or empty can write
            return true
        }

        let decryptedResult
        try {
            decryptedResult = await useCrypto().decryptCore(result, password)
        } catch (e) {
            console.error(e)
            // Probably Wrong password
            return false
        }

        // Probably Wrong password
        if (!decryptedResult.startsWith('[')) return false
        // can write
        return true
    }

    return {
        canWrite,
        readExact,
        readFile,
        readFileText,
        writeFile
    }
}



