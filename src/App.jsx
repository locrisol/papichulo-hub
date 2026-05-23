import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import UnauthorisedPage from './pages/auth/UnauthorisedPage'
import UsersPage from './pages/settings/UsersPage'
import RestaurantPage from './pages/settings/RestaurantPage'
import SuppliersPage from './pages/inventory/SuppliersPage'
import ProductsPage from './pages/inventory/ProductsPage'
import { DashboardScreen, StockTakeScreen, SalesScreen, InvoiceScreen, WasteScreen, ForecastScreen, AllergenScreen, CatalogueScreen } from './mockup/MockupScreens'


export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorised" element={<UnauthorisedPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/dashboard" element={<DashboardScreen />} />
                <Route path="/sales" element={<SalesScreen />} />
                <Route path="/invoices" element={<InvoiceScreen />} />
                <Route path="/waste" element={<WasteScreen />} />
                <Route path="/stocktake" element={<StockTakeScreen />} />
                <Route path="/catalogue" element={<CatalogueScreen />} />
                <Route path="/catalogue/suppliers" element={<SuppliersPage />} />
                <Route path="/catalogue/products" element={<ProductsPage />} />
                <Route path="/allergens" element={<AllergenScreen />} />
                <Route path="/forecast" element={<ForecastScreen />} />
                <Route path="/settings/users" element={<UsersPage />} />
                <Route path="/settings/restaurant" element={<RestaurantPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}