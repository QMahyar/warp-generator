import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toggle } from './toggle'

describe('Toggle', () => {
  it('renders its label text', () => {
    render(<Toggle checked={false} onChange={() => {}} label="My toggle" />)
    expect(screen.getByText('My toggle')).not.toBeNull()
  })

  it('calls onChange with the flipped value when clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="My toggle" />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
