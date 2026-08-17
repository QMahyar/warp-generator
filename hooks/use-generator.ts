'use client';

import { useState, useCallback } from 'react';
import type { SiteMode } from '@/types';
import type { GenerateResult, ApiResponse } from '@/types';
import { getEndpointValue, isExternalEndpoint } from '@/config/endpoints';
import { DEFAULT_DNS_ID } from '@/config/dns';
import type { GeneratorState } from './generator-state';
import { applyDnsSelection, applyServiceToggle, applySiteMode } from './generator-state';
export { useDebouncedCommit } from './use-debounced-commit';

export function formatApiError(message?: string): string {
  const cleaned = (message ?? '').trim().replace(/^(?:Error\s*:\s*|Generation failed\s*:\s*)+/i, '').trim();
  if (!cleaned || /^generation failed$/i.test(cleaned)) {
    return 'Generation failed. Please check the inputs and try again.';
  }
  return cleaned;
}

export function useGenerator() {
  const [state, setState] = useState<GeneratorState>({
    configFormat: 'wireguard',
    deviceType: 'awg15',
    siteMode: 'all',
    endpointId: 'default',
    customEndpoint: '',
    selectedServices: [],
    dnsId: DEFAULT_DNS_ID,
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
  });

  const set = useCallback(<K extends keyof GeneratorState>(
    key: K, value: GeneratorState[K]
  ) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Community DNS forbids split tunneling: selecting one forces "all sites" and
  // clears any selected services (the picker is hidden / "specific" disabled in UI).
  const setDnsId = useCallback((id: string) => {
    setState((prev) => applyDnsSelection(prev, id));
  }, []);

  // "Exclude LAN" only applies to "all sites"; switching to "specific" turns it off.
  const setSiteMode = useCallback((mode: SiteMode) => {
    setState((prev) => applySiteMode(prev, mode));
  }, []);

  const toggleService = useCallback((key: string) => {
    setState((prev) => applyServiceToggle(prev, key));
  }, []);

  const setEndpoint = useCallback((id: string) => {
    const externalUrl = isExternalEndpoint(id);
    if (externalUrl) {
      window.open(externalUrl, '_blank');
      return;
    }
    setState((prev) => ({
      ...prev,
      endpointId: id,
      customEndpoint: id === 'custom' ? '' : prev.customEndpoint,
    }));
  }, []);

  const handleGenerate = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: '', errorKind: null }));

    try {
      const endpoint = getEndpointValue(state.endpointId, state.customEndpoint);
      const persistentKeepalive = state.keepaliveEnabled
        ? (parseInt(state.keepaliveValue, 10) || 25)
        : null;
      const customI1Domain = state.customI1Enabled ? state.customI1Domain.trim() : '';

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedServices: state.selectedServices,
          siteMode: state.siteMode,
          deviceType: state.deviceType,
          endpoint,
          configFormat: state.configFormat,
          dnsId: state.dnsId,
          ipv6: state.ipv6,
          excludeLan: state.excludeLan,
          persistentKeepalive,
          customI1Domain,
        }),
      });

      const data = (await res.json()) as ApiResponse<GenerateResult>;

      if (data.success && data.content) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isGenerated: true,
          result: data.content!,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          errorKind: 'api',
          error: formatApiError(data.message),
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        errorKind: 'network',
        error: 'Network error. Check your internet connection and try again.',
      }));
    }
  }, [
    state.endpointId, state.customEndpoint, state.selectedServices, state.siteMode,
    state.deviceType, state.configFormat, state.dnsId, state.ipv6, state.excludeLan,
    state.keepaliveEnabled, state.keepaliveValue, state.customI1Enabled, state.customI1Domain,
  ]);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isGenerated: false,
      result: null,
      error: '',
      errorKind: null,
    }));
  }, []);

  const copyConfig = useCallback(async (): Promise<boolean> => {
    if (!state.result) return false;
    try {
      await navigator.clipboard.writeText(atob(state.result.configBase64));
      return true;
    } catch {
      return false;
    }
  }, [state.result]);

  const downloadConfig = useCallback(() => {
    if (!state.result) return;
    const a = document.createElement('a');
    a.href = 'data:application/octet-stream;base64,' + state.result.configBase64;
    a.download = state.result.fileName;
    a.click();
  }, [state.result]);

  return {
    state, set, toggleService, setEndpoint, setDnsId, setSiteMode,
    handleGenerate, reset, copyConfig, downloadConfig,
  };
}
