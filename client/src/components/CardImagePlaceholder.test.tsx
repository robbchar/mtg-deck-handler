import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import CardImagePlaceholder from './CardImagePlaceholder'

describe('CardImagePlaceholder', () => {
  it('renders without crashing', () => {
    render(<CardImagePlaceholder />)
  })

  it('renders the placeholder element with the correct test id', () => {
    render(<CardImagePlaceholder />)
    expect(screen.getByTestId('card-image-placeholder')).toBeInTheDocument()
  })

  it('is aria-hidden for accessibility', () => {
    render(<CardImagePlaceholder />)
    const el = screen.getByTestId('card-image-placeholder')
    expect(el).toHaveAttribute('aria-hidden', 'true')
  })

  it('has role="presentation"', () => {
    render(<CardImagePlaceholder />)
    const el = screen.getByTestId('card-image-placeholder')
    expect(el).toHaveAttribute('role', 'presentation')
  })

  it('applies custom className', () => {
    render(<CardImagePlaceholder className="h-14 w-10 shrink-0" />)
    const el = screen.getByTestId('card-image-placeholder')
    expect(el.className).toContain('h-14')
    expect(el.className).toContain('w-10')
  })

  it('does not render an img element', () => {
    render(<CardImagePlaceholder />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})