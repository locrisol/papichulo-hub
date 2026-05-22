import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/auth/LoginPage'
import UnauthorisedPage from './pages/auth/UnauthorisedPage'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'
import {
  T, S, Icon, icons,
  DashboardScreen, StockTakeScreen, SalesScreen,
  InvoiceScreen, WasteScreen, ForecastScreen,
  AllergenScreen, CatalogueScreen
} from './mockup/MockupScreens'

const navItems = [
  { id:"dashboard", label:"Cost Dashboard",  icon:icons.costs,    section:"Overview" },
  { id:"sales",     label:"Sales Recording", icon:icons.sales,    section:"Operations" },
  { id:"invoices",  label:"Invoices",        icon:icons.invoice,  section:"Operations" },
  { id:"waste",     label:"Waste Tracking",  icon:icons.waste,    section:"Operations" },
  { id:"stocktake", label:"Stock Take",      icon:icons.stock,    section:"Inventory" },
  { id:"catalogue", label:"Products",        icon:icons.cat,      section:"Inventory" },
  { id:"allergens", label:"Allergens",       icon:icons.alg,      section:"Inventory" },
  { id:"forecast",  label:"Forecasting",     icon:icons.forecast, section:"Analytics" },
]

const screens = {
  dashboard: { title:"Cost Dashboard",      component: DashboardScreen  },
  sales:     { title:"Sales Recording",     component: SalesScreen      },
  invoices:  { title:"Invoices",            component: InvoiceScreen    },
  waste:     { title:"Waste Tracking",      component: WasteScreen      },
  stocktake: { title:"Stock Take",          component: StockTakeScreen  },
  catalogue: { title:"Product Catalogue",   component: CatalogueScreen  },
  allergens: { title:"Allergen Management", component: AllergenScreen   },
  forecast:  { title:"Demand Forecasting",  component: ForecastScreen   },
}

function AppShell() {
  const [active, setActive] = useState('dashboard')
  const { user } = useAuth()
  const Screen = screens[active]?.component || DashboardScreen
  const sections = [...new Set(navItems.map(n => n.section))]

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={S.logo}>
          <div style={{ ...S.row, gap:8 }}>
            <span style={{ fontSize:20 }}>🌮</span>
            <div>
              <div style={S.logoT}>Papi Chulo Hub</div>
              <div style={S.logoSub}>POINT CAMPUS</div>
            </div>
          </div>
        </div>
        <div style={S.nav}>
          {sections.map(sec => (
            <div key={sec}>
              <div style={S.navSec}>{sec}</div>
              {navItems.filter(n => n.section === sec).map(n => (
                <div key={n.id} style={S.navItem(active === n.id)} onClick={() => setActive(n.id)}>
                  <Icon d={n.icon} size={15} color={active===n.id ? "#FFFFFF" : "#8FAB96"}/>
                  {n.label}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding:"16px 20px", borderTop:`1px solid ${T.sidebarA}` }}>
          <div style={{ ...S.row, gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:T.accent, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:13 }}>
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div style={{ color:"#FFFFFF", fontSize:13, fontWeight:600 }}>{user?.full_name || 'User'}</div>
              <div style={{ color:"#8FAB96", fontSize:11 }}>{user?.role || ''}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={S.main}>
        <div style={S.topbar}>
          <div style={S.topL}>
            <div style={S.pageTitle}>{screens[active]?.title}</div>
          </div>
          <div style={S.row}>
            <div style={{ ...S.card, padding:"6px 14px", fontSize:13, border:`1px solid ${T.border}` }}>
              <span style={{ color:T.muted }}>Week 20</span> · <span style={{ fontWeight:600 }}>11–17 May 2026</span>
            </div>
          </div>
        </div>
        <Screen/>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorised" element={<UnauthorisedPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}