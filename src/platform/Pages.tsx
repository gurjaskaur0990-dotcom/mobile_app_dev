import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { App as DeviceApp } from '@capacitor/app'
import { accentNames, backgrounds, useAppearance } from './appearance'
import { native, installAndroidRelease, onNativeUpdateProgress } from './native'
import { version as webVersion } from '../../package.json'
import { useApp } from './context'
import { PushSettings } from '../collaboration'
import { QueuePanel } from './Account'
export function Back({ to = '/settings' }: { to?: string }) {
  return (
    <Link className="page-back" to={to} aria-label="Back">
      ← Back
    </Link>
  )
}
export function Settings() {
  const appearance = useAppearance()
  const { logout, queue } = useApp()
  const [message, setMessage] = useState('')
  const palette: Record<string, string[]> =
    backgrounds[appearance.dark ? 'dark' : 'light']
  return (
    <section className="flutter-settings">
      <h1>Settings</h1>
      <h2>App Settings</h2>
      <div className="settings-group">
        <PushSettings />
        <button
          className="setting-row"
          onClick={() =>
            setMessage('Currency settings are locked in this version.')
          }
        >
          <span>
            Default Currency<small>Indian Rupee (₹)</small>
          </span>
          <span aria-hidden>₹</span>
        </button>
        <label className="setting-row">
          Theme Mode
          <select
            value={appearance.mode}
            onChange={(e) =>
              appearance.setMode(e.target.value as typeof appearance.mode)
            }
          >
            <option value="system">System Default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="setting-row">
          <span>
            Material You Theme
            <small>Sync with wallpaper and system colors on Android 12+</small>
          </span>
          <input
            type="checkbox"
            checked={appearance.dynamic}
            onChange={(e) => appearance.setDynamic(e.target.checked)}
          />
        </label>
        {appearance.dynamic ? (
          <p>Customized theme settings are managed by Material You Theme.</p>
        ) : (
          <>
            <fieldset className="swatches">
              <legend>Accent Color</legend>
              {Object.entries(accentNames).map(([hex, label]) => (
                <button
                  type="button"
                  key={hex}
                  title={label}
                  aria-label={label}
                  aria-pressed={appearance.accent === hex}
                  style={{ background: hex }}
                  onClick={() => appearance.setAccent(hex)}
                >
                  {appearance.accent === hex ? '✓' : ''}
                </button>
              ))}
            </fieldset>
            <label className="setting-row">
              Background Color
              <select
                value={
                  palette[appearance.background] ? appearance.background : 'default'
                }
                onChange={(e) => appearance.setBackground(e.target.value)}
              >
                {Object.entries(palette).map(([id, [name]]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      <h2>Account</h2>
      <div className="settings-group">
        <Link to="/about">About SplitTrip</Link>
        <Link to="/about-developer">About Developer</Link>
        {native && <Link to="/update">Check for Updates</Link>}
        <button className="setting-row" onClick={() => void logout()}>
          Sign Out
        </button>
      </div>
      {queue.length > 0 && <QueuePanel />}
    </section>
  )
}
function useInstalledVersion() {
  const [version, setVersion] = useState(webVersion)
  useEffect(() => {
    if (native)
      void DeviceApp.getInfo()
        .then((info) => setVersion(info.version))
        .catch(() => {})
  }, [])
  return version
}
export function About() {
  const version = useInstalledVersion()
  return (
    <section className="information">
      <Back />
      <h1>About SplitTrip</h1>
      <div className="identity-card">
        <img src="/flutter/logo.png" alt="" />
        <h2>SplitTrip</h2>
        <p>Version {version}</p>
      </div>
      <article className="card">
        <h2>Our Vision</h2>
        <p>
          SplitTrip is a modern, premium trip expense sharing application
          designed to eliminate the complexity of sharing bills. With full
          offline capability, real-time database synchronization, and fluid
          animations, SplitTrip ensures that split management during group
          travel is fast, smooth, and delightful.
        </p>
      </article>
      <h2>Key Highlights</h2>
      <dl className="info-list">
        <dt>Real-Time Sync</dt>
        <dd>
          Firestore streams keep expense ledgers instantly updated for everyone
          on the trip.
        </dd>
        <dt>Offline First</dt>
        <dd>
          Write expenses or accept invites offline. Data queues automatically
          and updates when online.
        </dd>
        <dt>Smart Notifications</dt>
        <dd>
          Receive background push notifications when you are invited to trips or
          when expenses change.
        </dd>
        <dt>Dynamic Theme</dt>
        <dd>
          Stunning Material You implementation that adapts dynamically to your
          system wallpapers.
        </dd>
      </dl>
      <Link to="/about-developer">Designed &amp; Developed By Ansh Sharma</Link>
      <p>
        <a href="mailto:officiallanshsharma@gmail.com">
          officiallanshsharma@gmail.com
        </a>
        <br />
        <a href="https://github.com/07-Ansh" target="_blank" rel="noreferrer">
          github.com/07-Ansh
        </a>
      </p>
      <small>© 2026 SplitTrip. All rights reserved.</small>
    </section>
  )
}
export function Developer() {
  return (
    <section className="information">
      <Back />
      <h1>About Developer</h1>
      <div className="identity-card">
        <img
          className="portrait"
          src="/flutter/developer.webp"
          alt="Ansh Sharma"
        />
        <h2>Ansh Sharma</h2>
        <p>Founder &amp; Lead Developer</p>
      </div>
      <h2>Connect with me</h2>
      <div className="settings-group">
        <a href="https://ansh.one" target="_blank" rel="noreferrer">
          Portfolio · ansh.one
        </a>
        <a href="https://github.com/07-Ansh" target="_blank" rel="noreferrer">
          GitHub · 07-Ansh
        </a>
        <a href="mailto:officiallanshsharma@gmail.com">
          Email · officiallanshsharma@gmail.com
        </a>
      </div>
      <article className="card">
        <h2>About Me</h2>
        <p>
          I design, develop, and deploy smooth, premium full-stack mobile and
          web applications. SplitTrip was built with a relentless focus on
          performance, rich animations, and state-of-the-art UX.
        </p>
      </article>
    </section>
  )
}
const repo = 'gurjaskaur0990-dotcom/mobile_app_dev'
export async function checkAndroidUpdate() {
  const { version } = await DeviceApp.getInfo()
  const response = await fetch(
    'https://api.github.com/repos/' + repo + '/releases/latest',
    {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    },
  )
  if (response.status === 404) return { version }
  if (!response.ok)
    throw Error('Could not check GitHub releases. Try again later.')
  const release = await response.json()
  const tag = String(release.tag_name || '').replace(/^v/, '')
  const asset = release.assets?.find((item: { name: string }) =>
    /^splittrip-react[\w.-]*\.apk$/i.test(item.name),
  )
  const numbers = (s: string) => s.split('.').map(Number)
  const current = numbers(version),
    next = numbers(tag)
  const index = next.findIndex((v, i) => v !== (current[i] || 0))
  if (
    !asset ||
    !/^\d+\.\d+\.\d+$/.test(tag) ||
    index < 0 ||
    next[index] <= (current[index] || 0)
  )
    return { version }
  return {
    version,
    tag,
    notes: String(release.body || ''),
    url: String(asset.browser_download_url),
  }
}
export function Updates() {
  const [info, setInfo] =
      useState<Awaited<ReturnType<typeof checkAndroidUpdate>>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [downloading, setDownloading] = useState(false),
    [percent, setPercent] = useState<number | null>(null)
  useEffect(() => (native ? onNativeUpdateProgress(setPercent) : undefined), [])
  async function download() {
    if (!info?.url || downloading) return
    setError('')
    setPercent(null)
    setDownloading(true)
    try {
      await installAndroidRelease(info.url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }
  async function check() {
    setBusy(true)
    setError('')
    try {
      setInfo(native ? await checkAndroidUpdate() : { version: webVersion })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void check()
  }, [])
  return (
    <section className="information">
      <Back />
      <h1>App Updates</h1>
      {busy ? (
        <p role="status">Checking for updates…</p>
      ) : (
        info && (
          <article className="card">
            <h2>
              {info.tag
                ? 'Update available'
                : native
                  ? 'You’re up to date'
                  : 'Web version'}
            </h2>
            <p>Current version · {info.version}</p>
            {info.tag ? (
              <>
                <p>Latest version · {info.tag}</p>
                <p className="changelog">{info.notes}</p>
                {downloading && (
                  <label>
                    Downloading update{' '}
                    <progress max={100} value={percent ?? undefined} />
                    {percent !== null && ' ' + percent + '%'}
                  </label>
                )}
                <button
                  className="button"
                  disabled={downloading}
                  onClick={() => void download()}
                >
                  {downloading ? 'Downloading…' : 'Update Now'}
                </button>
              </>
            ) : (
              <p>
                {native
                  ? 'You have the latest available React release.'
                  : 'Web updates are available when you reload SplitTrip.'}
              </p>
            )}
          </article>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {native && (
        <button disabled={busy || downloading} onClick={() => void check()}>
          Check Again
        </button>
      )}{' '}
      <button disabled={downloading} onClick={() => navigate('/settings')}>
        {info?.tag ? 'Later' : 'Done'}
      </button>
    </section>
  )
}
