import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const args = [
  'emulators:exec',
  '--config',
  'firebase.emulator.json',
  '--project',
  'demo-splittrip-flutter',
  '--only',
  'auth,firestore,functions',
  '--export-on-exit=.flutter-emulator-data',
]
if (existsSync('.flutter-emulator-data/firebase-export-metadata.json'))
  args.push('--import', '.flutter-emulator-data')
args.push('npm run demo:client')
const child = spawn(
  process.execPath,
  [require.resolve('firebase-tools/lib/bin/firebase.js'), ...args],
  { stdio: 'inherit' },
)
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 0
})
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => child.kill(signal))
