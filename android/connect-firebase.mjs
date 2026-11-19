import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'

const android = fileURLToPath(new URL('./', import.meta.url))
const projectId = 'splittrip-1879b'
const packageName = 'com.splittrip.react'
const firebase = resolve(
  android,
  '../node_modules/firebase-tools/lib/bin/firebase.js',
)
const debugApk = join(android, 'app/build/outputs/apk/debug/app-debug.apk')
const normalize = (hash = '') => hash.replaceAll(':', '').toLowerCase()

function run(executable, args, cwd, failure) {
  const child = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  if (child.error || child.status !== 0) throw Error(failure)
  return child.stdout
}

function checkApk(apk) {
  if (!existsSync(apk))
    throw Error(
      'Build the signed Android APK before registering its certificate.',
    )
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(
      homedir(),
      process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk',
    )
  const tools = join(sdk, 'build-tools/35.0.0')
  const data = run(
    join(tools, 'aapt'),
    ['dump', 'badging', apk],
    android,
    'Could not read the APK. Set ANDROID_HOME to an SDK with Build Tools 35.0.0.',
  )
  if (/^package: name='([^']+)'/m.exec(data)?.[1] !== packageName)
    throw Error('Select the signed APK for com.splittrip.react.')
  const report = run(
    join(tools, 'apksigner'),
    ['verify', '--print-certs', apk],
    android,
    'The Android SDK could not verify the APK signature. Check JAVA_HOME and the APK.',
  )
  const sha1 = /^Signer #1 certificate SHA-1 digest: ([\da-f]{40})$/im.exec(
    report,
  )?.[1]
  const sha256 = /^Signer #1 certificate SHA-256 digest: ([\da-f]{64})$/im.exec(
    report,
  )?.[1]
  if (!sha1 || !sha256 || /^Signer #2 certificate/m.test(report))
    throw Error(
      'Expected one verified signer with SHA-1 and SHA-256 fingerprints.',
    )
  if (apk === debugApk) {
    const signing = run(
      join(android, 'gradlew'),
      ['--offline', '--console=plain', ':app:signingReport'],
      android,
      'Could not read the debug signing report. Set JAVA_HOME and ANDROID_HOME and build the debug APK first.',
    )
    const debug =
      signing
        .split(/^Variant: /m)
        .find((variant) => /^debug\r?\n/.test(variant)) || ''
    const expected1 = normalize(/^SHA1: ([\da-f:]+)$/im.exec(debug)?.[1])
    const expected256 = normalize(/^SHA-256: ([\da-f:]+)$/im.exec(debug)?.[1])
    if (expected1 !== normalize(sha1) || expected256 !== normalize(sha256))
      throw Error(
        'The APK signer differs from the current Gradle debug key. Build the APK with the intended key and retry.',
      )
  }
  return { sha1: normalize(sha1), sha256: normalize(sha256) }
}

async function register(scratch, { sha1, sha256 }) {
  function cli(command, args, json = true) {
    const output = run(
      process.execPath,
      [
        firebase,
        command,
        ...args,
        '--project',
        projectId,
        '--non-interactive',
        ...(json ? ['--json'] : []),
      ],
      scratch,
      `Firebase ${command} failed. Check Firebase CLI sign-in and app-management access to ${projectId}.`,
    )
    if (json) {
      let response
      try {
        response = JSON.parse(output)
      } catch {
        throw Error(`Firebase ${command} returned an unreadable response.`)
      }
      if (response.status !== 'success')
        throw Error(`Firebase ${command} did not succeed.`)
      return response.result
    }
  }
  const findApp = () =>
    cli('apps:list', ['ANDROID']).find((app) => app.packageName === packageName)
  let app = findApp()
  if (!app) {
    try {
      app = cli('apps:create', [
        'ANDROID',
        'SplitTrip React',
        '--package-name',
        packageName,
      ])
    } catch (error) {
      app = findApp()
      if (!app) throw error
    }
  }
  if (
    app.packageName !== packageName ||
    !/^1:\d+:android:[a-z0-9]+$/i.test(app.appId)
  )
    throw Error(
      'The returned Android app identity does not match the React package.',
    )
  const registered = () =>
    cli('apps:android:sha:list', [app.appId]).map((c) => normalize(c.shaHash))
  const hashes = registered()
  for (const hash of [sha1, sha256]) {
    if (hashes.includes(hash)) continue
    try {
      cli('apps:android:sha:create', [
        app.appId,
        hash.match(/../g).join(':').toUpperCase(),
      ])
    } catch (error) {
      if (!registered().includes(hash)) throw error
    }
  }
  // Firebase can take a moment to propagate a new SHA registration to its Android OAuth client.
  const destination = join(android, 'app/google-services.json')
  for (const seconds of [0, 2, 5, 10, 20]) {
    if (seconds) await delay(seconds * 1000)
    const downloaded = join(scratch, `config-${seconds}.json`)
    cli('apps:sdkconfig', ['ANDROID', app.appId, '--out', downloaded], false)
    const config = JSON.parse(readFileSync(downloaded, 'utf8'))
    const client = config.client?.find(
      (c) => c.client_info?.android_client_info?.package_name === packageName,
    )
    if (
      config.project_info?.project_id !== projectId ||
      String(config.project_info?.project_number) !== app.appId.split(':')[1] ||
      client?.client_info?.mobilesdk_app_id !== app.appId ||
      !client.api_key?.some((key) => key.current_key)
    )
      throw Error(
        'Firebase returned an SDK configuration for a different or incomplete registration.',
      )
    const oauth = client.oauth_client || []
    const googleClient = oauth.some((c) => c.client_type === 3 && c.client_id)
    const signedClient = oauth.some(
      (c) =>
        c.client_type === 1 &&
        c.client_id &&
        c.android_info?.package_name === packageName &&
        normalize(c.android_info?.certificate_hash) === sha1,
    )
    if (googleClient && signedClient) {
      renameSync(downloaded, destination)
      console.log(
        'Firebase Android configuration saved for com.splittrip.react. Rebuild the APK with the same signing key.',
      )
      return
    }
  }
  throw Error(
    'The React app and signing certificates are registered. Firebase has not supplied both its web OAuth client and the Android OAuth client for this signing certificate. Check the Google sign-in provider in Firebase Authentication and rerun this command.',
  )
}

let scratch
try {
  const { values } = parseArgs({
    options: { apk: { type: 'string' }, 'check-apk': { type: 'boolean' } },
  })
  const fingerprints = checkApk(values.apk ? resolve(values.apk) : debugApk)
  console.log(
    'Verified the package and signing certificate of the SplitTrip React APK.',
  )
  if (!values['check-apk']) {
    // Keep downloaded configs and CLI diagnostics private, and rename on the same filesystem.
    scratch = mkdtempSync(join(android, 'app/.firebase-registration-'))
    await register(scratch, fingerprints)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true })
}
