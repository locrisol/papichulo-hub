import logo from '@/assets/PapiChuloLogo.png'

// The card on the green background that sign in, a forgotten password and
// choosing a password all sit on, so the three read as one place.
//
// The h1 is the Hub's name on every one of them, because these pages are
// outside the app shell and have no header of their own. What the page is for
// goes underneath as an h2.
export default function AuthCard({ title, children }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
                <div className="flex flex-col items-center mb-8">
                    <img src={logo} alt="Papi Chulo" className="h-16 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900">Papi Chulo Hub</h1>
                    <p className="text-sm text-muted mt-1">Business management system</p>
                </div>
                {title && <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>}
                {children}
            </div>
        </div>
    )
}
