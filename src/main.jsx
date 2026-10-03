import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { RestaurantProvider } from '@/context/RestaurantContext'
import { ConfirmProvider } from '@/context/ConfirmContext'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { readStored, writeStored } from '@/lib/browserStore'
import '@/index.css'
import App from '@/App'

// Where the app starts.
//
// The order of the providers matters and is not just tidiness. RestaurantProvider
// reads the signed-in user to know which restaurants to load and whether to load
// more than one, so it has to sit inside AuthProvider. Swap them and it has no
// user to work from.
//
// Both are above BrowserRouter's children rather than inside a page, because the
// user and the active restaurant have to survive moving between pages.
//
// ConfirmProvider is the innermost of the three. It needs nothing from the other
// two, and being inside them means the one dialog it renders sits above every
// page without each page having to carry its own.
//
// The boundary is the outermost thing, so a fault in any of them still ends in
// a message and a Reload button rather than a white page. AppLayout has a
// second one around the page itself that clears when the address changes.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <RestaurantProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </RestaurantProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)

// A tab left open across a deploy still holds the old page list, and the
// files it names are gone, so the next page it opened came up blank. Vite
// says so with this event, and a reload picks up the new files.
//
// Once only. The time of the reload is kept for the tab, and a second failure
// within ten seconds is a real fault rather than an old tab, so it is left to
// reach the boundary and its message. If the browser will not keep the time,
// there is no telling a second failure from a first, so it does not reload at
// all rather than risk reloading for ever.
const RELOADED = 'reloadedForNewFiles'

window.addEventListener('vite:preloadError', event => {
  const last = Number(readStored('session', RELOADED))
  if (last && Date.now() - last < 10000) return

  const now = String(Date.now())
  writeStored('session', RELOADED, now)
  if (readStored('session', RELOADED) !== now) return

  event.preventDefault()
  window.location.reload()
})