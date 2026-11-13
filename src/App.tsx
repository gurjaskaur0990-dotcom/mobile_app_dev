import { useEffect, useState, useRef } from 'react'
import {
  IonApp,
  IonPage,
  IonContent,
  IonIcon,
  IonRouterOutlet,
} from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import {
  barChart,
  settingsOutline,
  notificationsOutline,
  briefcaseOutline,
} from 'ionicons/icons'
import {
  Route,
  Routes,
  Link,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { App as DeviceApp } from '@capacitor/app'
import { PushNotifications } from '@capacitor/push-notifications'
import { AuthGate } from './platform/auth'
import { useApp } from './platform/context'
import { useRows } from './platform/live'
import { useUpdate } from './platform/update'
import {
  Settings,
  About,
  Developer,
  Updates,
  checkAndroidUpdate,
} from './platform/Pages'
import { ProfilePage } from './platform/Profile'
import { AppearanceProvider } from './platform/appearance'
import { native } from './platform/native'
import { emulator } from './platform/firebase'
import {
  Home,
  Analytics,
  TripView,
  ExpenseEditor,
  ExpenseDetail,
  Archive,
  Trash,
} from './ledger'
import { Inbox, Administration, Announcement } from './collaboration'
function TripRedirect() {
  const { tripId } = useParams()
  return (
    <Navigate
      replace
      to={'/trips/' + encodeURIComponent(tripId!) + '/expenses'}
    />
  )
}
function Shell() {
  const { pathname, search } = useLocation(),
    nav = useNavigate()
  const { uid, profile, admin, queue } = useApp()
  const inbox = useRows<{ isRead: boolean }>(
    'users/' + uid + '/notifications',
    [],
    { orderBy: ['receivedAt', 'desc'], limit: 50 },
  )
  const unread = inbox.data.filter((item) => !item.isRead).length
  const tabs =
    pathname === '/' || pathname === '/analytics' || pathname === '/settings'
  const [online, setOnline] = useState(navigator.onLine),
    [later, defer] = useState(false),
    [exitNotice, setExit] = useState('')
  const { ready, activate } = useUpdate()
  useEffect(() => {
    const handler = () => setOnline(navigator.onLine)
    window.addEventListener('online', handler)
    window.addEventListener('offline', handler)
    return () => {
      window.removeEventListener('online', handler)
      window.removeEventListener('offline', handler)
    }
  }, [])
  useEffect(() => {
    void document.querySelector('ion-content')?.scrollToTop(0)
  }, [pathname])
  useEffect(() => {
    if (!native) return
    let mounted = true
    const action = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (e) => {
        const id = e.notification.data?.tripId
        nav(
          typeof id === 'string' && id && !id.includes('/')
            ? '/trip/' + encodeURIComponent(id)
            : '/notifications',
        )
      },
    )
    if (!emulator)
      void checkAndroidUpdate()
        .then((result) => {
          if (mounted && result.tag) nav('/update')
        })
        .catch(() => {})
    return () => {
      mounted = false
      void action.then((h) => h.remove())
    }
  }, [uid])
  useEffect(() => {
    if (!native) return
    let previous = 0
    const sub = DeviceApp.addListener('backButton', ({ canGoBack }) => {
      if (pathname === '/analytics' || pathname === '/settings') {
        nav('/')
        return
      }
      if (pathname !== '/') {
        if (canGoBack) nav(-1)
        else nav('/')
        return
      }
      if (Date.now() - previous < 2000) {
        void DeviceApp.exitApp()
        return
      }
      previous = Date.now()
      setExit('Press back again to exit')
      setTimeout(() => setExit(''), 2000)
    })
    return () => {
      void sub.then((h) => h.remove())
    }
  }, [pathname, nav])
  const gesture = useRef<{ x: number; y: number } | null>(null)
  function finishSwipe(x: number, y: number) {
    const start = gesture.current
    gesture.current = null
    if (
      !tabs ||
      !start ||
      Math.abs(x - start.x) < 72 ||
      Math.abs(x - start.x) < 2 * Math.abs(y - start.y)
    )
      return
    const pages = ['/analytics', '/', '/settings']
    const next = pages[pages.indexOf(pathname) + (x < start.x ? 1 : -1)]
    if (next) nav(next)
  }
  const [hintDone, setHintDone] = useState(false)
  const q = new URLSearchParams(search).get('q') || ''
  return (
    <div className={'flutter-app' + (tabs ? ' with-dock' : '')}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {tabs && (
        <header className="flutter-top">
          <Link
            to="/notifications"
            className="round-control"
            aria-label={
              'Notifications' + (unread ? ', ' + unread + ' unread' : '')
            }
          >
            <IonIcon icon={notificationsOutline} />
            {unread > 0 && <small>{unread > 9 ? '9+' : unread}</small>}
          </Link>
          <div className="trip-search">
            <input
              aria-label="Search trips"
              placeholder=" "
              type="search"
              value={q}
              onChange={(e) =>
                nav(
                  e.target.value
                    ? '/?q=' + encodeURIComponent(e.target.value)
                    : '/',
                  { replace: true },
                )
              }
            />
            {!q && (
              <span
                className={'search-hint' + (hintDone ? ' complete' : '')}
                aria-hidden="true"
              >
                <b>SplitTrip</b>
                <span className="search-dots">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span
                  className="search-prompt"
                  onAnimationEnd={() => setHintDone(true)}
                >
                  {online ? 'Search your trips' : 'Offline'}
                </span>
              </span>
            )}
          </div>
          <Link to="/profile" className="avatar" aria-label="Your profile">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt="" />
            ) : (
              profile.displayName[0]
            )}
          </Link>
        </header>
      )}
      <IonContent
        onTouchStart={(e) => {
          const el = e.target as HTMLElement
          gesture.current =
            tabs &&
            e.touches.length === 1 &&
            !el.closest(
              'input,button,select,textarea,dialog,[role="dialog"],.swatches',
            )
              ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
              : null
        }}
        onTouchEnd={(e) => {
          if (e.changedTouches.length === 1)
            finishSwipe(
              e.changedTouches[0].clientX,
              e.changedTouches[0].clientY,
            )
        }}
        onTouchCancel={() => {
          gesture.current = null
        }}
      >
        <main id="main-content" className="flutter-content" tabIndex={-1}>
          {!online && (
            <div className="sync-status" role="status">
              Offline · Changes will sync when you reconnect.
            </div>
          )}
          {queue.length > 0 && (
            <Link to="/settings" className="sync-status">
              {queue.length}{' '}
              {queue.some((item) => item.error)
                ? 'changes need review'
                : 'changes pending sync'}
            </Link>
          )}
          {exitNotice && <div role="status">{exitNotice}</div>}
          {tabs && <Announcement />}
          {ready && (!later || pathname === '/settings') && (
            <aside className="update">
              An app update is ready.{' '}
              <button
                onClick={() => {
                  if (window.confirm('Reload SplitTrip to update?')) activate()
                }}
              >
                Reload to update
              </button>
              {!later && <button onClick={() => defer(true)}>Later</button>}
            </aside>
          )}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/trip/:tripId" element={<TripRedirect />} />
            <Route path="/trips/:tripId" element={<TripRedirect />} />
            <Route path="/trips/:tripId/:section" element={<TripView />} />
            <Route path="/trip/:tripId/:section" element={<TripView />} />
            <Route
              path="/trip/:tripId/add-expense"
              element={<ExpenseEditor />}
            />
            <Route
              path="/trips/:tripId/expenses/new"
              element={<ExpenseEditor />}
            />
            {[
              '/trip/:tripId/expense/:entryId',
              '/trips/:tripId/expenses/:entryId',
            ].map((path) => (
              <Route key={path} path={path} element={<ExpenseDetail />} />
            ))}
            {[
              '/trip/:tripId/expense/:entryId/edit',
              '/trips/:tripId/expenses/:entryId/edit',
            ].map((path) => (
              <Route key={path} path={path} element={<ExpenseEditor />} />
            ))}
            <Route path="/archive" element={<Archive />} />
            <Route path="/recently-deleted" element={<Trash />} />
            <Route
              path="/trash"
              element={<Navigate to="/recently-deleted" replace />}
            />
            <Route path="/notifications" element={<Inbox />} />
            <Route
              path="/inbox"
              element={<Navigate replace to="/notifications" />}
            />
            <Route path="/profile" element={<ProfilePage />} />
            <Route
              path="/admin"
              element={
                admin ? (
                  <Administration />
                ) : (
                  <h1>Administrator access required</h1>
                )
              }
            />
            <Route path="/about" element={<About />} />
            <Route path="/about-developer" element={<Developer />} />
            <Route
              path="/developer"
              element={<Navigate to="/about-developer" replace />}
            />
            <Route path="/update" element={<Updates />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/suspended" element={<Navigate to="/" replace />} />
            <Route
              path="*"
              element={
                <section>
                  <h1>Page not found</h1>
                  <Link to="/">Back to trips</Link>
                </section>
              }
            />
          </Routes>
        </main>
      </IonContent>
      {tabs && (
        <nav className="flutter-dock" aria-label="Main navigation">
          {[
            ['/analytics', 'Analytics', barChart],
            ['/', 'Trips', briefcaseOutline],
            ['/settings', 'Settings', settingsOutline],
          ].map(([to, label, icon]) => (
            <NavLink end key={to} to={to}>
              <IonIcon icon={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
export default function App() {
  return (
    <IonApp>
      <AppearanceProvider>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route
              path="/*"
              element={
                <IonPage>
                  <AuthGate>
                    <Shell />
                  </AuthGate>
                </IonPage>
              }
            />
          </IonRouterOutlet>
        </IonReactRouter>
      </AppearanceProvider>
    </IonApp>
  )
}
