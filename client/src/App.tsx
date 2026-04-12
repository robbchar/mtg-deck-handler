import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DeckProvider } from './context/DeckContext'
import { ToastProvider } from './context/ToastContext'
import { useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './components/LoginPage'
import Spinner from './components/Spinner'
import DeckList from './pages/DeckList'
import DeckEditor from './pages/DeckEditor'

/**
 * Root application component.
 *
 * Shows a loading spinner while Firebase resolves auth state.
 * Shows LoginPage when no user is signed in.
 * Shows the full app (Router + routes) when authenticated.
 *
 * Routes:
 *   /           → DeckList  — browse and manage all decks
 *   /deck/:id   → DeckEditor — edit a specific deck
 */
function App() {
  const { user, loading } = useAuth()

  if (loading) return <Spinner />
  if (!user) return <LoginPage />

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DeckProvider>
        <ToastProvider>
          <div className="min-h-screen bg-gray-50 text-gray-900">
            <Routes>
              <Route
                path="/"
                element={
                  <ErrorBoundary>
                    <DeckList />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/deck/:id"
                element={
                  <ErrorBoundary>
                    <DeckEditor />
                  </ErrorBoundary>
                }
              />
            </Routes>
          </div>
        </ToastProvider>
      </DeckProvider>
    </BrowserRouter>
  )
}

export default App
