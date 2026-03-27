import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import FormatSelect, { FORMATS } from './FormatSelect'

describe('FormatSelect', () => {
  it('renders a "— none —" option', () => {
    render(<FormatSelect value="" onChange={() => {}} />)
    expect(screen.getByRole('option', { name: '— none —' })).toBeInTheDocument()
  })

  it('renders an option for every format', () => {
    render(<FormatSelect value="" onChange={() => {}} />)
    for (const f of FORMATS) {
      expect(
        screen.getByRole('option', { name: f.charAt(0).toUpperCase() + f.slice(1) }),
      ).toBeInTheDocument()
    }
  })

  it('forwards props to the select element', () => {
    const onChange = vi.fn()
    render(
      <FormatSelect
        value="modern"
        onChange={onChange}
        data-testid="my-select"
        className="w-full"
      />,
    )
    const select = screen.getByTestId('my-select')
    expect(select).toHaveValue('modern')
    expect(select).toHaveClass('w-full')
  })
})
