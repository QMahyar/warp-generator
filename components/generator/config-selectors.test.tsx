import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigSelectors } from './config-selectors'

type ConfigSelectorsProps = ComponentProps<typeof ConfigSelectors>

Element.prototype.scrollIntoView = vi.fn()

function renderSelectors(overrides: Partial<ConfigSelectorsProps> = {}) {
  const callbacks = {
    onFormatChange: vi.fn(),
    onDeviceChange: vi.fn(),
    onSiteModeChange: vi.fn(),
    onEndpointChange: vi.fn(),
    onCustomEndpointChange: vi.fn(),
    onDnsChange: vi.fn(),
    onExcludeLanChange: vi.fn(),
  }
  const props: ConfigSelectorsProps = {
    configFormat: 'wireguard',
    deviceType: 'awg15',
    siteMode: 'all',
    endpointId: 'default',
    customEndpoint: '',
    dnsId: 'cf',
    communityDns: false,
    excludeLan: false,
    ...callbacks,
    ...overrides,
  }
  render(<ConfigSelectors {...props} />)
  return { callbacks, props }
}

function activeOptionText(trigger: HTMLElement): string | null {
  const id = trigger.getAttribute('aria-activedescendant')
  if (!id) return null
  return document.getElementById(id)?.textContent ?? null
}

describe('ConfigSelectors', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the listbox on trigger click and selects an option on click', async () => {
    const user = userEvent.setup()
    const { callbacks } = renderSelectors()
    const trigger = screen.getByRole('button', { name: /config format/i })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await user.click(screen.getByRole('option', { name: 'Throne' }))
    expect(callbacks.onFormatChange).toHaveBeenCalledWith('throne')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('option', { name: 'Throne' })).toBeNull()
  })

  it('closes on pointerdown outside and keeps focus on the trigger', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.pointerDown(document.body)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape and refocuses the trigger', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /endpoint/i })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Tab', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /endpoint/i })
    await user.click(trigger)
    await user.keyboard('{Tab}')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('moves the active option with ArrowDown and ArrowUp', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    await user.click(trigger)
    expect(activeOptionText(trigger)).toBe('1.1.1.1')
    await user.keyboard('{ArrowDown}')
    expect(activeOptionText(trigger)).toBe('8.8.8.8')
    await user.keyboard('{ArrowDown}')
    expect(activeOptionText(trigger)).toBe('dns.quad9.net')
    await user.keyboard('{ArrowUp}')
    expect(activeOptionText(trigger)).toBe('8.8.8.8')
  })

  it('skips disabled options with ArrowDown', async () => {
    const user = userEvent.setup()
    renderSelectors({ communityDns: true })
    const trigger = screen.getByRole('button', { name: /config type/i })
    await user.click(trigger)
    expect(activeOptionText(trigger)).toBe('All sites')
    await user.keyboard('{ArrowDown}')
    expect(activeOptionText(trigger)).toBe('All sites')
  })

  it('jumps to first and last enabled options with Home and End', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    await user.click(trigger)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    expect(activeOptionText(trigger)).toBe('dns.quad9.net')
    await user.keyboard('{Home}')
    expect(activeOptionText(trigger)).toBe('1.1.1.1')
    await user.keyboard('{End}')
    expect(activeOptionText(trigger)).toBe('dns.mafioznik.xyz •')
  })

  it('selects the highlighted option with Enter or Space and closes', async () => {
    const user = userEvent.setup()
    const { callbacks } = renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    await user.click(trigger)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(callbacks.onDnsChange).toHaveBeenCalledWith('google')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')
    expect(callbacks.onDnsChange).toHaveBeenLastCalledWith('quad9')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('type-ahead accumulates the typed prefix across keystrokes', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    await user.click(trigger)
    await user.keyboard('d')
    expect(activeOptionText(trigger)).toBe('dns.quad9.net')
    await user.keyboard('n')
    expect(activeOptionText(trigger)).toBe('dns.malw.link •')
    await user.keyboard('s')
    expect(activeOptionText(trigger)).toBe('dns.geohide.ru •')
    await user.keyboard('.')
    expect(activeOptionText(trigger)).toBe('dns.comss.one •')
    await user.keyboard('m')
    expect(activeOptionText(trigger)).toBe('dns.mafioznik.xyz •')
    await user.keyboard('a')
    expect(activeOptionText(trigger)).toBe('dns.malw.link •')
    await user.keyboard('z')
    expect(activeOptionText(trigger)).toBe('dns.malw.link •')
  })

  it('type-ahead matches case-insensitively', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    await user.click(trigger)
    await user.keyboard('D')
    expect(activeOptionText(trigger)).toBe('dns.quad9.net')
    await user.keyboard('{Escape}')
    await user.click(trigger)
    await user.keyboard('X')
    expect(activeOptionText(trigger)).toBe('xbox-dns.ru •')
  })

  it('type-ahead wraps around to the start of the list', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    await user.click(trigger)
    await user.keyboard('{End}')
    expect(activeOptionText(trigger)).toBe('dns.mafioznik.xyz •')
    await user.keyboard('1')
    expect(activeOptionText(trigger)).toBe('1.1.1.1')
  })

  it('type-ahead skips disabled options', async () => {
    const user = userEvent.setup()
    renderSelectors({ communityDns: true })
    const trigger = screen.getByRole('button', { name: /config type/i })
    await user.click(trigger)
    await user.keyboard('s')
    expect(activeOptionText(trigger)).toBe('All sites')
  })

  it('type-ahead opens the listbox when closed', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.focus()
    await user.keyboard('d')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(activeOptionText(trigger)).toBe('dns.quad9.net')
  })

  it('resets the type-ahead buffer after ~500ms idle', () => {
    vi.useFakeTimers()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'x' })
    expect(activeOptionText(trigger)).toBe('xbox-dns.ru •')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.keyDown(trigger, { key: 'd' })
    expect(activeOptionText(trigger)).toBe('dns.geohide.ru •')
  })

  it('renders disabled options as aria-disabled and not selectable', async () => {
    const user = userEvent.setup()
    const { callbacks } = renderSelectors({ communityDns: true })
    const trigger = screen.getByRole('button', { name: /config type/i })
    await user.click(trigger)
    const disabledOption = screen.getByRole('option', { name: 'Specific sites' })
    expect(disabledOption.getAttribute('aria-disabled')).toBe('true')
    await user.click(disabledOption)
    expect(callbacks.onSiteModeChange).not.toHaveBeenCalled()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('reflects open state and selection via aria attributes', async () => {
    const user = userEvent.setup()
    renderSelectors()
    const trigger = screen.getByRole('button', { name: /dns/i })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('option', { name: '1.1.1.1' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    expect(screen.getByRole('option', { name: '8.8.8.8' }).getAttribute('aria-selected')).toBe(
      'false'
    )
  })
})

