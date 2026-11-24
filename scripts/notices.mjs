import { copyFile, cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const destination = 'dist/licenses'
await mkdir(destination, { recursive: true })
await cp('licenses', destination, { recursive: true })
await copyFile('LICENSE', 'dist/LICENSE.txt')
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md')
const taken = []
for (const name of [
  'monaco-editor',
  'react',
  'react-dom',
  'scheduler',
  'diff',
  'fflate',
  'ignore',
  '@noble/hashes',
  'marked',
  'parse5',
  'entities',
  'yaml',
  'vite',
  'rolldown',
]) {
  const directory = join('node_modules', name)
  const names = (await readdir(directory)).filter((file) =>
    /^(licen[cs]e|thirdpartynotices|notice)/i.test(file),
  )
  if (!names.length) throw new Error(`License metadata missing for ${name}`)
  for (const file of names) {
    const target = `${name.replace('@', '').replace('/', '-')}-${file.replace(/(?:\.txt|\.md)$/i, '')}.txt`
    await copyFile(join(directory, file), join(destination, target))
    taken.push(target)
  }
}
await writeFile(join(destination, 'bundled.txt'), `${taken.join('\n')}\n`)
