'use client';

import { useState } from 'react';
import { Toggle } from './toggle';
import { useDebouncedCommit } from '@/hooks/use-generator';

interface AdvancedSettingsProps {
  ipv6: boolean;
  onIpv6Change: (v: boolean) => void;
  keepaliveEnabled: boolean;
  onKeepaliveEnabledChange: (v: boolean) => void;
  keepaliveValue: string;
  /** Called synchronously on every keepalive keystroke (not only on blur). */
  onKeepaliveValueChange: (v: string) => void;
  customI1Enabled: boolean;
  onCustomI1EnabledChange: (v: boolean) => void;
  customI1Domain: string;
  /** Called synchronously on every I1-domain keystroke (not only on blur). */
  onCustomI1DomainChange: (v: string) => void;
}

export function AdvancedSettings({
  ipv6, onIpv6Change,
  keepaliveEnabled, onKeepaliveEnabledChange, keepaliveValue, onKeepaliveValueChange,
  customI1Enabled, onCustomI1EnabledChange, customI1Domain, onCustomI1DomainChange,
}: AdvancedSettingsProps) {
  const [open, setOpen] = useState(false);
  // The local value is what the input shows; the parent's onKeepaliveValueChange
  // fires on blur/debounce to persist into generator state. The ref-based
  // latest-value read in use-generator (handleGenerate) covers the case where
  // Generate is clicked before the debounce flushes.
  const [keepaliveLocal, setKeepaliveLocal, commitKeepalive] = useDebouncedCommit(keepaliveValue, onKeepaliveValueChange);
  const [i1Local, setI1Local, commitI1] = useDebouncedCommit(customI1Domain, onCustomI1DomainChange);

  return (
    <div className="mb-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
      >
        Additional settings
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>

      {open && (
        <div className="mt-2.5 flex flex-col gap-3 bg-[var(--surface-2)] rounded-[var(--radius-md)] px-3.5 py-3">
          <Toggle checked={ipv6} onChange={onIpv6Change} label="IPv6" />

          <div className="flex items-center gap-3 flex-wrap">
            <Toggle
              checked={keepaliveEnabled}
              onChange={onKeepaliveEnabledChange}
              label="PersistentKeepalive"
            />
            {keepaliveEnabled && (
              <span className="flex items-center gap-1.5 text-[13px] text-[var(--text-dim)]">
                =
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={keepaliveLocal}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    setKeepaliveLocal(v);
                    // Mirror into the parent's latest-value ref so Generate
                    // right after typing uses this value, not the stale one.
                    onKeepaliveValueChange(v);
                  }}
                  onBlur={commitKeepalive}
                  placeholder="25"
                  className="w-14 h-8 bg-[var(--surface-3)] rounded-[var(--radius-sm)] px-2 text-center text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:ring-1 focus:ring-[var(--amber-700)]"
                />
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Toggle
              checked={customI1Enabled}
              onChange={onCustomI1EnabledChange}
              label="Custom I1"
            />
            {customI1Enabled && (
              <input
                type="text"
                value={i1Local}
                onChange={(e) => {
                  const v = e.target.value;
                  setI1Local(v);
                  // Mirror into the parent's latest-value ref (see keepalive).
                  onCustomI1DomainChange(v);
                }}
                onBlur={commitI1}
                placeholder="Enter a domain (e.g. google.com)"
                spellCheck={false}
                className="w-full h-9 bg-[var(--surface-3)] rounded-[var(--radius-md)] px-3 text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:ring-1 focus:ring-[var(--amber-700)]"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
