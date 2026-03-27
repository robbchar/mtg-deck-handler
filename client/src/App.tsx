import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DeckProvider } from './context/DeckContext'
import DeckList from './pages/DeckList'
import DeckEditor from './pages/DeckEditor'

/**
 * Root application component.
 *
 * Routes:
 *   /           → DeckList  — browse and manage all decks
 *   /deck/:id   → DeckEditor — edit a specific deck
 */
function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DeckProvider>
        <div className="min-h-screen bg-gray-50 text-gray-900">
          <Routes>
            <Route path="/" element={<DeckList />} />
            <Route path="/deck/:id" element={<DeckEditor />} />
          </Routes>
        </div>
      </DeckProvider>
    </BrowserRouter>
  )
}

export default App
