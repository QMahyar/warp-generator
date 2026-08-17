import type { ConfigFormat, DeviceType, SiteMode } from '@/types'
import type { GenerateResult } from '@/types'
import { isCommunityDns } from '@/config/dns'

export interface GeneratorState {
  configFormat: ConfigFormat;
  deviceType: DeviceType;
  siteMode: SiteMode;
  endpointId: string;
  customEndpoint: string;
  selectedServices: string[];
  dnsId: string;
  ipv6: boolean;
  excludeLan: boolean;
  keepaliveEnabled: boolean;
  keepaliveValue: string;
  customI1Enabled: boolean;
  customI1Domain: string;
  isLoading: boolean;
  isGenerated: boolean;
  error: string;
  errorKind: 'network' | 'api' | null;
  result: GenerateResult | null;
}

// Community DNS forbids split tunneling: selecting one forces "all sites" and
// clears any selected services (the picker is hidden / "specific" disabled in UI).
export function applyDnsSelection(state: GeneratorState, id: string): GeneratorState {
  if (isCommunityDns(id)) {
    return { ...state, dnsId: id, siteMode: 'all', selectedServices: [] }
  }
  return { ...state, dnsId: id }
}

// "Exclude LAN" only applies to "all sites"; switching to "specific" turns it off.
export function applySiteMode(state: GeneratorState, mode: SiteMode): GeneratorState {
  if (mode === 'specific' && isCommunityDns(state.dnsId)) return state
  if (mode === 'specific') return { ...state, siteMode: mode, excludeLan: false }
  return { ...state, siteMode: mode }
}

export function applyServiceToggle(state: GeneratorState, key: string): GeneratorState {
  if (isCommunityDns(state.dnsId)) return state
  const selectedServices = state.selectedServices.includes(key)
    ? state.selectedServices.filter((s) => s !== key)
    : [...state.selectedServices, key]
  return { ...state, selectedServices, excludeLan: selectedServices.length ? false : state.excludeLan }
}
