const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

// Read the archive directly so verification does not depend on Electron's ASAR loader.
function verifyPackage(appOutDir) {
  const archivePath = path.join(appOutDir, 'resources', 'app.asar')
  const archive = fs.readFileSync(archivePath)
  const dataStart = 8 + archive.readUInt32LE(4)
  const header = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)).toString())
  let checked = 0
  const packedFiles = new Map()

  function walk(files, parent = '') {
    for (const [name, entry] of Object.entries(files)) {
      const filename = parent ? `${parent}/${name}` : name
      if (entry.files) {
        walk(entry.files, filename)
        continue
      }
      if (entry.link) continue
      let contents
      if (entry.unpacked) {
        contents = fs.readFileSync(path.join(`${archivePath}.unpacked`, ...filename.split('/')))
      } else {
        const start = dataStart + Number(entry.offset)
        contents = archive.subarray(start, start + entry.size)
      }
      if (contents.length !== entry.size) throw new Error(`Packaged file size mismatch: ${filename}`)
      if (entry.integrity) {
        const hash = createHash('sha256').update(contents).digest('hex')
        if (hash !== entry.integrity.hash) throw new Error(`Packaged file integrity mismatch: ${filename}`)
      }
      if (filename === 'package.json') packedFiles.set(filename, contents)
      checked++
    }
  }

  walk(header.files)
  const pkg = JSON.parse(packedFiles.get('package.json').toString())
  function fileEntry(filename) {
    let entry = header
    for (const part of filename.split('/')) entry = entry?.files?.[part]
    return entry && !entry.files ? entry : null
  }
  for (const filename of [
    pkg.main.replace(/^\.\//, ''),
    'out/preload/index.js',
    'out/renderer/index.html',
    'node_modules/sql.js/dist/sql-wasm.wasm',
    'node_modules/playwright/cli.js'
  ]) {
    if (!fileEntry(filename)) throw new Error(`Required packaged file missing: ${filename}`)
  }
  if (!fileEntry('node_modules/playwright-core/package.json') &&
      !fileEntry('node_modules/playwright/node_modules/playwright-core/package.json')) {
    throw new Error('Required packaged dependency missing: playwright-core')
  }
  for (const name of ['data', 'logs', 'example', 'manual-screenshots']) {
    if (header.files[name]) throw new Error(`Development-only directory packaged: ${name}`)
  }
  console.log(`Package verified: ${checked} files (${archivePath})`)
}

module.exports = async (context) => verifyPackage(context.appOutDir)

if (require.main === module) {
  try {
    verifyPackage(process.argv[2] || 'dist/win-unpacked')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
