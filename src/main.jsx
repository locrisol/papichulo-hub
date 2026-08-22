import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RestaurantProvider } from './context/RestaurantContext'
import { ConfirmProvider } from './context/ConfirmContext'
import './index.css'
import App from './App'

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
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RestaurantProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </RestaurantProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)