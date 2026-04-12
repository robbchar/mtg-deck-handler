import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">MTG Deck Handler</h1>
        <p className="text-gray-400">Sign in to manage your decks</p>
        <button
          onClick={() => signIn().catch(console.error)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
