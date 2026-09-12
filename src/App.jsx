// Every address in the app and who is allowed to open it.
//
// The routes are in one file on purpose. Access is decided in two places and
// they have to agree: the sidebar in AppLayout decides what you are offered, and
// this decides what happens if you type an address anyway. Both read the same
// role lists out of lib/access.js, so a link cannot be hidden while the page
// behind it still loads.
//
// None of this protects the data. Row level security does that, in the database,
// and it holds even if everything here is wrong. This is about not handing
// somebody a screen that can only turn them away.
//
// The public allergen page sits outside ProtectedRoute, because a customer
// scanning a QR code has no account and never will.
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import UnauthorisedPage from './pages/auth/UnauthorisedPage'
import RequireRole from './components/RequireRole'
import { ALL_ROLES, MANAGERS, RESTAURANT_CONFIG, ADMIN_ONLY } from './lib/access'
import { useAuth } from './context/AuthContext'
import { homeFor } from './lib/access'

// Every screen is fetched when somebody actually opens it.
//
// All 32 were imported at the top, so the browser downloaded the roster,
// the weekly report builder, the stock take and jsPDF before it could show
// the login box. That is over a megabyte and a half of JavaScript, and the
// worst case is not a manager on a laptop: it is a customer scanning a QR
// code on a phone, on data, for a page that is two hundred lines long.
//
// Login and the unauthorised page stay eager. They are tiny, and they are
// the two screens somebody might see before anything else has loaded.
const UsersPage = lazy(() => import('./pages/settings/UsersPage'))
const ChangesPage = lazy(() => import('./pages/settings/ChangesPage'))
const RestaurantPage = lazy(() => import('./pages/settings/RestaurantPage'))
const SuppliersPage = lazy(() => import('./pages/inventory/SuppliersPage'))
const ProductsPage = lazy(() => import('./pages/inventory/ProductsPage'))
const ProductPricesPage = lazy(() => import('./pages/inventory/ProductPricesPage'))
const RecipePage = lazy(() => import('./pages/inventory/RecipePage'))
const AllergenPage = lazy(() => import('./pages/inventory/AllergenPage'))
const MenuItemsPage = lazy(() => import('./pages/inventory/MenuItemsPage'))
const MenuItemPage = lazy(() => import('./pages/inventory/MenuItemPage'))
const PublicAllergensPage = lazy(() => import('./pages/PublicAllergensPage'))
const PublicAllergensPreviewPage = lazy(() => import('./pages/inventory/PublicAllergensPreviewPage'))
const StockTakesListPage = lazy(() => import('./pages/inventory/StockTakesListPage'))
const StockTakeCountPage = lazy(() => import('./pages/inventory/StockTakeCountPage'))
const StockTakeReviewPage = lazy(() => import('./pages/inventory/StockTakeReviewPage'))
const StockTakeSummaryPage = lazy(() => import('./pages/inventory/StockTakeSummaryPage'))
const SalesPage = lazy(() => import('./pages/sales/SalesPage'))
const WeeklySalesPage = lazy(() => import('./pages/sales/WeeklySalesPage'))
const InvoicesPage = lazy(() => import('./pages/invoices/InvoicesPage'))
const InvoiceHistoryPage = lazy(() => import('./pages/invoices/InvoiceHistoryPage'))
const LabourPage = lazy(() => import('./pages/costs/LabourPage'))
const WasteLogPage = lazy(() => import('./pages/waste/WasteLogPage'))
const WasteSummaryPage = lazy(() => import('./pages/waste/WasteSummaryPage'))
const CostDashboardPage = lazy(() => import('./pages/costs/CostDashboardPage'))
const ReportsListPage = lazy(() => import('./pages/reports/ReportsListPage'))
const ReportPage = lazy(() => import('./pages/reports/ReportPage'))
const EventCalendarPage = lazy(() => import('./pages/forecast/EventCalendarPage'))
const EmployeesPage = lazy(() => import('./pages/team/EmployeesPage'))
const RosterPage = lazy(() => import('./pages/roster/RosterPage'))
const MyShiftsPage = lazy(() => import('./pages/roster/MyShiftsPage'))



export default function App() {
  return (
    // What is on screen while the next page arrives. Deliberately plain: on a
    // fast connection it is never seen, and on a slow one a spinner that
    // appears for 80ms is worse than nothing at all.
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
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

                {/* The weekly report. Managers read it, store managers write it,
                    and which of those you are is settled in the database rather
                    than by which page you reached. */}
                <Route path="/reports" element={<RequireRole allowed={MANAGERS}><ReportsListPage /></RequireRole>} />
                <Route path="/reports/:id" element={<RequireRole allowed={MANAGERS}><ReportPage /></RequireRole>} />

                {/* Anyone logs waste; only managers see the week. */}
                <Route path="/waste" element={<RequireRole allowed={ALL_ROLES}><WasteLogPage /></RequireRole>} />
                <Route path="/waste/summary" element={<RequireRole allowed={MANAGERS}><WasteSummaryPage /></RequireRole>} />

                {/* The catalogue is managers only, because every one of these
                    screens shows what we pay. An employee counting stock sees
                    products and units on the stock take screen instead, with no
                    money on it.

                    Suppliers is the deliberate exception, open to everyone, so
                    anyone taking a wrong delivery can ring the rep.

                    There is no /catalogue on its own. It used to render an early
                    design screen with hardcoded products and prices that looked
                    exactly like real data. Nothing linked to it, but the address
                    worked. /catalogue/products is the real one. */}
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

                {/* The people who work here. Managers and above, and nothing
                    below that: the row carries what somebody costs per hour, and
                    the database refuses the whole table to anyone else. */}
                <Route path="/team" element={<RequireRole allowed={MANAGERS}><EmployeesPage /></RequireRole>} />
                <Route path="/roster" element={<RequireRole allowed={MANAGERS}><RosterPage /></RequireRole>} />
                <Route path="/my-shifts" element={<MyShiftsPage />} />

                {/* Settings. Restaurant configuration excludes owners. */}
                <Route path="/settings/users" element={<RequireRole allowed={ADMIN_ONLY}><UsersPage /></RequireRole>} />
                <Route path="/settings/changes" element={<RequireRole allowed={ADMIN_ONLY}><ChangesPage /></RequireRole>} />
                <Route path="/settings/restaurant" element={<RequireRole allowed={RESTAURANT_CONFIG}><RestaurantPage /></RequireRole>} />

                <Route path="/" element={<HomeRedirect />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
    </Suspense>
  )
}

// The dashboard is no use to an employee, who cannot read any of it, so send
// them where their work actually is.
function HomeRedirect() {
    const { session, user, loading } = useAuth()
    if (loading || (session && !user)) return null
    return <Navigate to={homeFor(user)} replace />
}
