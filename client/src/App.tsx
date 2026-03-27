import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DeckProvider } from './context/DeckContext'
import { ToastProvider } from './context/ToastContext'
import ErrorBoundary from './components/ErrorBoundary'
import DeckList from './pages/DeckList'
import DeckEditor from './pages/DeckEditor'

/**
 * Root application component.
 *
 * Routes:
 *   /           → DeckList  — browse and manage all decks
 *   /deck/:id   → DeckEditor — edit a specific deck
 *
 * ErrorBoundary wraps each page so a crash in one page doesn't affect the other.
 * ToastProvider makes addToast available to all descendants via useToastContext.
 */
function App() {
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
