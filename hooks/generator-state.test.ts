import { describe, expect, it } from 'vitest'
import { applyDnsSelection, applyServiceToggle, applySiteMode } from './generator-state'
import type { GeneratorState } from './generator-state'

function makeState(overrides: Partial<GeneratorState> = {}): GeneratorState {
  return {
    configFormat: 'wireguard',
    deviceType: 'awg15',
    siteMode: 'all',
    endpointId: 'default',
    customEndpoint: '',
    selectedServices: [],
    dnsId: 'cf',
    ipv6: true,
    excludeLan: false,
    keepaliveEnabled: false,
    keepaliveValue: '',
    customI1Enabled: false,
    customI1Domain: '',
    isLoading: false,
    isGenerated: false,
    error: '',
    errorKind: null,
    result: null,
    ...overrides,
  }
}

describe('applyDnsSelection', () => {
  it('forces siteMode all and clears selectedServices when a community DNS is selected', () => {
    const prev = makeState({ siteMode: 'specific', selectedServices: ['team-chat'], dnsId: 'cf' })
    const next = applyDnsSelection(prev, 'malw')
    expect(next.dnsId).toBe('malw')
    expect(next.siteMode).toBe('all')
    expect(next.selectedServices).toEqual([])
  })

  it('changes only dnsId for a non-community DNS', () => {
    const prev = makeState({ siteMode: 'specific', selectedServices: ['team-chat'], excludeLan: true })
    const next = applyDnsSelection(prev, 'google')
    expect(next.dnsId).toBe('google')
    expect(next).toEqual({ ...prev, dnsId: 'google' })
  })
})

describe('applySiteMode', () => {
  it('turns excludeLan off when switching to specific', () => {
    const prev = makeState({ siteMode: 'all', excludeLan: true })
    const next = applySiteMode(prev, 'specific')
    expect(next.siteMode).toBe('specific')
    expect(next.excludeLan).toBe(false)
  })

  it('returns the same state reference when switching to specific with a community DNS', () => {
    const prev = makeState({ siteMode: 'all', excludeLan: true, dnsId: 'malw' })
    expect(applySiteMode(prev, 'specific')).toBe(prev)
  })

  it('changes siteMode and leaves excludeLan untouched when switching to all', () => {
    const prev = makeState({ siteMode: 'specific', excludeLan: true })
    const next = applySiteMode(prev, 'all')
    expect(next.siteMode).toBe('all')
    expect(next.excludeLan).toBe(true)
    expect(next).toEqual({ ...prev, siteMode: 'all' })
  })
})

describe('applyServiceToggle', () => {
  it('adds a key and clears excludeLan', () => {
    const prev = makeState({ excludeLan: true })
    const next = applyServiceToggle(prev, 'team-chat')
    expect(next.selectedServices).toEqual(['team-chat'])
    expect(next.excludeLan).toBe(false)
  })

  it('removing the last key does not restore excludeLan', () => {
    const prev = makeState({ selectedServices: ['team-chat'], excludeLan: false })
    const next = applyServiceToggle(prev, 'team-chat')
    expect(next.selectedServices).toEqual([])
    expect(next.excludeLan).toBe(false)
  })

  it('returns the same state reference when a community DNS is active', () => {
    const prev = makeState({ selectedServices: ['team-chat'], excludeLan: true, dnsId: 'malw' })
    expect(applyServiceToggle(prev, 'team-chat')).toBe(prev)
  })
})
