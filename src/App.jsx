import { Routes, Route, Navigate } from 'react-router-dom'
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
import StockTakeCountPage from './pages/inventory/StockTakeCountPage'
import StockTakeReviewPage from './pages/inventory/StockTakeReviewPage'
import StockTakeSummaryPage from './pages/inventory/StockTakeSummaryPage'
import SalesPage from './pages/sales/SalesPage'
import WeeklySalesPage from './pages/sales/WeeklySalesPage'
import InvoicesPage from './pages/invoices/InvoicesPage'
import { DashboardScreen, WasteScreen, ForecastScreen, CatalogueScreen } from './mockup/MockupScreens'

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
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/sales/weekly" element={<WeeklySalesPage />} />
                <Route path="/invoices" element={<InvoicesPage />} />
                <Route path="/waste" element={<WasteScreen />} />
                <Route path="/catalogue" element={<CatalogueScreen />} />
                <Route path="/catalogue/suppliers" element={<SuppliersPage />} />
                <Route path="/catalogue/products" element={<ProductsPage />} />
                <Route path="/catalogue/products/:id/prices" element={<ProductPricesPage />} />
                <Route path="/catalogue/products/:id/recipe" element={<RecipePage />} />
                <Route path="/catalogue/products/:id/allergens" element={<AllergenPage />} />
                <Route path="/catalogue/menu-items" element={<MenuItemsPage />} />
                <Route path="/catalogue/menu-items/:id" element={<MenuItemPage />} />
                <Route path="/inventory/stock-takes" element={<StockTakesListPage />} />
                <Route path="/inventory/stock-takes/:id" element={<StockTakeCountPage />} />
                <Route path="/inventory/stock-takes/:id/review" element={<StockTakeReviewPage />} />
                <Route path="/inventory/stock-takes/:id/summary" element={<StockTakeSummaryPage />} />
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
