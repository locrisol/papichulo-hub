import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import UnauthorisedPage from './pages/auth/UnauthorisedPage'
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
import { DashboardScreen, StockTakeScreen, SalesScreen, InvoiceScreen, WasteScreen, ForecastScreen, AllergenScreen, CatalogueScreen } from './mockup/MockupScreens'

function StockTakeCountPlaceholder() {
  const { id } = useParams()
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-2">Stock take #{id}</h1>
      <p className="text-sm text-muted">Count screen coming in the next step.</p>
    </div>
  )
}

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
                <Route path="/dashboard" element={<DashboardScreen />} />
                <Route path="/sales" element={<SalesScreen />} />
                <Route path="/invoices" element={<InvoiceScreen />} />
                <Route path="/waste" element={<WasteScreen />} />
                <Route path="/stocktake" element={<StockTakeScreen />} />
                <Route path="/catalogue" element={<CatalogueScreen />} />
                <Route path="/catalogue/suppliers" element={<SuppliersPage />} />
                <Route path="/catalogue/products" element={<ProductsPage />} />
                <Route path="/catalogue/products/:id/prices" element={<ProductPricesPage />} />
                <Route path="/catalogue/products/:id/recipe" element={<RecipePage />} />
                <Route path="/catalogue/products/:id/allergens" element={<AllergenPage />} />
                <Route path="/catalogue/menu-items" element={<MenuItemsPage />} />
                <Route path="/catalogue/menu-items/:id" element={<MenuItemPage />} />
                <Route path="/inventory/stock-takes" element={<StockTakesListPage />} />
                <Route path="/inventory/stock-takes/:id" element={<StockTakeCountPlaceholder />} />
                <Route path="/inventory/public-allergens" element={<PublicAllergensPreviewPage />} />
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
