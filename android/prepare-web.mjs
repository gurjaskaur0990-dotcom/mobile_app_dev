import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const mode = process.argv[2]
if (!['live', 'local'].includes(mode)) throw new Error('Choose live or local Android assets.')

function run(script, args, env = {}) {
  const { status, error } = spawnSync(
    process.execPath,
    [resolve(root, 'node_modules', script), ...args],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    },
  )
  if (error) throw error
  if (status !== 0) process.exit(status ?? 1)
}

const marker = 'splittrip-target.json'
function build(target) {
  const local = target === 'local'
  const folder =
    'android/app/build/generated/' +
    (local ? 'flutter-emulator-assets' : 'flutter-live-assets') +
    '/public'
  run(
    'vite/bin/vite.js',
    ['build', '--mode', local ? 'emulator' : 'production', '--outDir', folder, '--emptyOutDir'],
    {
      NODE_ENV: 'production',
      VITE_EMULATOR_HOST: '127.0.0.1',
    },
  )
  writeFileSync(
    resolve(root, folder, marker),
    JSON.stringify({ target, project: local ? 'demo-splittrip-flutter' : 'splittrip-1879b' }) +
      '\n',
  )
  return folder
}

run('typescript/bin/tsc', ['--noEmit'])
// Capacitor copies only this production build to src/main. A local build overlays its own assets.
const live = build('live')
run('@capacitor/cli/bin/capacitor', ['sync', 'android'], { SPLITTRIP_ANDROID_WEB_DIR: live })
const copied = JSON.parse(
  readFileSync(resolve(root, 'android/app/src/main/assets/public', marker), 'utf8'),
)
if (copied.target !== 'live')
  throw new Error('Capacitor did not copy the production Android bundle.')
if (mode === 'local') build('local')
