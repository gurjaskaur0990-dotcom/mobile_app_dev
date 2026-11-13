import { createRoot } from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import './style.css'
import App from './App'
import { liveLocalUrl } from './platform/environment'
const canonical = liveLocalUrl(location.href)
if (canonical) {
  location.replace(canonical.href)
} else {
  // Flutter web shares links through its hash router.
  if (/^#\/(?![\/\\])/.test(location.hash)) {
    const path = new URL(location.hash.slice(1), location.origin)
    if (path.origin === location.origin)
      history.replaceState(history.state, '', path.pathname + path.search)
  }
  setupIonicReact({ mode: 'md', animated: false })
  createRoot(document.getElementById('root')!).render(<App />)
}
