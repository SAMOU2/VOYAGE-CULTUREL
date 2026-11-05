import { randomUUID } from 'node:crypto'
import { writeFile, rename, unlink } from 'node:fs/promises'

/** Le fichier précédent et la mémoire restent intacts en cas d'échec d'écriture. */
export async function atomicJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
