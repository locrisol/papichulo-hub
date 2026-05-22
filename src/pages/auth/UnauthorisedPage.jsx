import { useNavigate } from 'react-router-dom'

export default function UnauthorisedPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <p className="text-4xl mb-4">🚫</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-sm text-gray-500 mb-6">
          You do not have permission to view this page.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          Go back
        </button>
      </div>
    </div>
  )
}