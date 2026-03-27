import { createContext, useReducer } from 'react'

/**
 * @typedef {{ decks: object[], loading: boolean, error: string | null }} DeckState
 * @typedef {{ type: string, payload?: unknown }} DeckAction
 */

/** @type {DeckState} */
const INITIAL_STATE = {
  decks: [],
  loading: false,
  error: null,
}

/**
 * Pure reducer for deck state transitions.
 * All operations that mutate the decks array use the reducer's own `state`
 * parameter — never a closed-over snapshot — to avoid stale closure bugs.
 *
 * @param {DeckState} state
 * @param {DeckAction} action
 * @returns {DeckState}
 */
function deckReducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null }

    case 'FETCH_SUCCESS':
      return { ...state, loading: false, decks: action.payload }

    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    // Append a new deck (used for optimistic create with a temp id).
    case 'ADD_DECK':
      return { ...state, decks: [...state.decks, action.payload] }

    // Replace the optimistic placeholder (identified by tempId) with the real
    // server deck once the POST /api/decks call resolves.
    // Operates on current state, not a stale closure snapshot.
    case 'REPLACE_TEMP_DECK':
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id === action.payload.tempId ? action.payload.deck : d
        ),
      }

    // Remove a deck that was optimistically added but whose server call failed.
    case 'ROLLBACK_ADD':
      return {
        ...state,
        decks: state.decks.filter((d) => d.id !== action.payload),
      }

    // Replace an existing deck by id (used for optimistic update and confirm).
    case 'UPDATE_DECK':
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id === action.payload.id ? action.payload : d
        ),
      }

    // Remove a deck by id (used for optimistic delete).
    case 'REMOVE_DECK':
      return {
        ...state,
        decks: state.decks.filter((d) => d.id !== action.payload),
      }

    // Re-insert a deck that was optimistically removed but whose delete failed.
    case 'ROLLBACK_REMOVE':
      return {
        ...state,
        decks: [...state.decks, action.payload],
      }

    default:
      return state
  }
}

/**
 * The DeckContext holds the full deck state and the dispatch function.
 * Consumers should use the `useDecks` hook rather than this context directly.
 */
export const DeckContext = createContext(null)

/**
 * DeckProvider wraps the application (or a subtree) and makes deck state
 * available to all descendants via DeckContext.
 *
 * Usage:
 * ```jsx
 * <DeckProvider>
 *   <App />
 * </DeckProvider>
 * ```
 *
 * @param {{ children: React.ReactNode }} props
 */
export function DeckProvider({ children }) {
  const [state, dispatch] = useReducer(deckReducer, INITIAL_STATE)

  return (
    <DeckContext.Provider value={{ state, dispatch }}>
      {children}
    </DeckContext.Provider>
  )
}