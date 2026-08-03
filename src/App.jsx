import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import UnauthorisedPage from './pages/auth/UnauthorisedPage'
import RequireRole from './components/RequireRole'
import { ALL_ROLES, MANAGERS, RESTAURANT_CONFIG } from './lib/access'
import { useAuth } from './context/AuthContext'
import { homeFor } from './lib/access'

import UsersPage from './pages/settings/UsersPage'
import RestaurantPage from './pages/settings/RestaurantPage'
import SuppliersPage from './pages/inventory/SuppliersPage'
import ProductsPage from './pages/inventory/ProductsPage'
import ProductPricesPage from './pages/inventory/ProductPricesPage'
import RecipePage from './pages/inventory/RecipePage'
import AllergenPage from './pages/inventory/AllergenPage'
import MenuItemsPage from './pages/inventory/MenuItemsPage'
import MenuItemPage from './pages/inventory/MenuItemPage'
import PublicAllergensPage from './pages/PublicAllergensPage'
import PublicAllergensPreviewPage from './pages/inventory/PublicAllergensPreviewPage'
import StockTakesListPage from './pages/inventory/StockTakesListPage'
import StockTakeCountPage from './pages/inventory/StockTakeCountPage'
import StockTakeReviewPage from './pages/inventory/StockTakeReviewPage'
import StockTakeSummaryPage from './pages/inventory/StockTakeSummaryPage'
import SalesPage from './pages/sales/SalesPage'
import WeeklySalesPage from './pages/sales/WeeklySalesPage'
import InvoicesPage from './pages/invoices/InvoicesPage'
import InvoiceHistoryPage from './pages/invoices/InvoiceHistoryPage'
import LabourPage from './pages/costs/LabourPage'
import WasteLogPage from './pages/waste/WasteLogPage'
import WasteSummaryPage from './pages/waste/WasteSummaryPage'
import CostDashboardPage from './pages/costs/CostDashboardPage'
import EventCalendarPage from './pages/forecast/EventCalendarPage'
import { CatalogueScreen } from './mockup/MockupScreens'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorised" element={<UnauthorisedPage />} />
      <Route path="/allergens/:slug" element={<PublicAllergensPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                {/* Managers and above. Employees have no access to money. */}
                <Route path="/dashboard" element={<RequireRole allowed={MANAGERS}><CostDashboardPage /></RequireRole>} />
                <Route path="/sales" element={<RequireRole allowed={MANAGERS}><SalesPage /></RequireRole>} />
                <Route path="/sales/weekly" element={<RequireRole allowed={MANAGERS}><WeeklySalesPage /></RequireRole>} />
                <Route path="/invoices" element={<RequireRole allowed={MANAGERS}><InvoicesPage /></RequireRole>} />
                <Route path="/invoices/history" element={<RequireRole allowed={MANAGERS}><InvoiceHistoryPage /></RequireRole>} />
                <Route path="/costs/labour" element={<RequireRole allowed={MANAGERS}><LabourPage /></RequireRole>} />

                {/* Anyone logs waste; only managers see the week. */}
                <Route path="/waste" element={<RequireRole allowed={ALL_ROLES}><WasteLogPage /></RequireRole>} />
                <Route path="/waste/summary" element={<RequireRole allowed={MANAGERS}><WasteSummaryPage /></RequireRole>} />

                {/* The catalogue is readable by everyone: an employee counting
                    stock needs to see products and their units. Writing is
                    refused by the database. */}
                <Route path="/catalogue" element={<RequireRole allowed={MANAGERS}><CatalogueScreen /></RequireRole>} />
                <Route path="/catalogue/suppliers" element={<RequireRole allowed={ALL_ROLES}><SuppliersPage /></RequireRole>} />
                <Route path="/catalogue/products" element={<RequireRole allowed={MANAGERS}><ProductsPage /></RequireRole>} />
                <Route path="/catalogue/products/:id/prices" element={<RequireRole allowed={MANAGERS}><ProductPricesPage /></RequireRole>} />
                <Route path="/catalogue/products/:id/recipe" element={<RequireRole allowed={MANAGERS}><RecipePage /></RequireRole>} />
                <Route path="/catalogue/products/:id/allergens" element={<RequireRole allowed={MANAGERS}><AllergenPage /></RequireRole>} />
                <Route path="/catalogue/menu-items" element={<RequireRole allowed={MANAGERS}><MenuItemsPage /></RequireRole>} />
                <Route path="/catalogue/menu-items/:id" element={<RequireRole allowed={MANAGERS}><MenuItemPage /></RequireRole>} />

                {/* Counting is the employee's job. Reviewing and closing is not. */}
                <Route path="/inventory/stock-takes" element={<RequireRole allowed={ALL_ROLES}><StockTakesListPage /></RequireRole>} />
                <Route path="/inventory/stock-takes/:id" element={<RequireRole allowed={ALL_ROLES}><StockTakeCountPage /></RequireRole>} />
                <Route path="/inventory/stock-takes/:id/review" element={<RequireRole allowed={MANAGERS}><StockTakeReviewPage /></RequireRole>} />
                <Route path="/inventory/stock-takes/:id/summary" element={<RequireRole allowed={MANAGERS}><StockTakeSummaryPage /></RequireRole>} />
                <Route path="/inventory/public-allergens" element={<RequireRole allowed={MANAGERS}><PublicAllergensPreviewPage /></RequireRole>} />

                <Route path="/forecast" element={<RequireRole allowed={ALL_ROLES}><EventCalendarPage /></RequireRole>} />

                {/* Settings. Restaurant configuration excludes owners. */}
                <Route path="/settings/users" element={<RequireRole allowed={MANAGERS}><UsersPage /></RequireRole>} />
                <Route path="/settings/restaurant" element={<RequireRole allowed={RESTAURANT_CONFIG}><RestaurantPage /></RequireRole>} />

                <Route path="/" element={<HomeRedirect />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

// The dashboard is no use to an employee, who cannot read any of it, so send
// them where their work actually is.
function HomeRedirect() {
    const { session, user, loading } = useAuth()
    if (loading || (session && !user)) return null
    return <Navigate to={homeFor(user)} replace />
}
