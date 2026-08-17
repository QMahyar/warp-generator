'use client';

import { useState, useRef, useEffect, useId } from 'react';
import type { KeyboardEvent } from 'react';
import { CONFIG_FORMATS } from '@/config/formats';
import { ENDPOINTS } from '@/config/endpoints';
import { DNS_PROVIDERS } from '@/config/dns';
import { FlagIcon } from '@/components/icons/flag-icon';
import { Toggle } from './toggle';
import type { ConfigFormat, DeviceType, SiteMode } from '@/types';

interface DropdownOption {
  id: string;
  label: string;
  flag?: string;
  disabled?: boolean;
}

interface DropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (id: string) => void;
}

function Dropdown({ label, value, options, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => {
    const idx = options.findIndex((o) => o.id === value);
    return idx >= 0 && !options[idx].disabled ? idx : options.findIndex((o) => !o.disabled);
  });
  const ref = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLElement | null)[]>([]);
  const listboxId = useId();
  const current = options.find((o) => o.id === value);
  const enabledIndices = options
    .map((o, i) => (!o.disabled ? i : -1))
    .filter((i) => i >= 0);
  const firstEnabled = enabledIndices[0] ?? -1;
  const lastEnabled = enabledIndices[enabledIndices.length - 1] ?? -1;
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  useEffect(() => {
    const idx = options.findIndex((o) => o.id === value);
    setActiveIndex(idx >= 0 && !options[idx].disabled ? idx : firstEnabled);
  }, [value, options, firstEnabled]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const openListbox = () => {
    const idx = options.findIndex((o) => o.id === value);
    setActiveIndex(idx >= 0 && !options[idx].disabled ? idx : firstEnabled);
    setOpen(true);
  };

  const moveActive = (dir: 1 | -1) => {
    setActiveIndex((prev) => {
      if (prev < 0) return firstEnabled;
      let i = prev + dir;
      while (i >= 0 && i < options.length) {
        if (!options[i].disabled) return i;
        i += dir;
      }
      return prev;
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (open) moveActive(1);
        else openListbox();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) moveActive(-1);
        else openListbox();
        break;
      case 'Home':
        e.preventDefault();
        if (open && firstEnabled >= 0) setActiveIndex(firstEnabled);
        break;
      case 'End':
        e.preventDefault();
        if (open && lastEnabled >= 0) setActiveIndex(lastEnabled);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openListbox();
        else if (activeIndex >= 0 && !options[activeIndex].disabled) {
          onChange(options[activeIndex].id);
          setOpen(false);
        }
        break;
      case 'Escape':
        if (open) {
          setOpen(false);
          e.currentTarget.focus();
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button"
        onClick={() => (open ? setOpen(false) : openListbox())}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        className={`w-full text-left bg-[var(--surface-2)] rounded-[var(--radius-md)] px-3.5 py-2.5 transition-colors hover:bg-[var(--surface-3)] cursor-pointer ${open ? 'bg-[var(--surface-3)]' : ''}`}>
        <p className="text-[11px] text-[var(--text-dim)] font-light mb-0.5">{label}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-[var(--text)] flex items-center gap-2 truncate">
            {current?.flag && <FlagIcon code={current.flag} />}
            {current?.label || value}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            className={`shrink-0 text-[var(--text-dim)] transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      </button>
      {open && (
        <div role="listbox" id={listboxId} aria-label={label}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--surface)] rounded-[var(--radius-md)] py-1 max-h-[220px] overflow-y-auto"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {options.map((opt, i) => {
            if (opt.disabled) {
              return (
                <div key={opt.id} role="option" id={`${listboxId}-opt-${i}`}
                  aria-selected={opt.id === value} aria-disabled="true"
                  className="w-full text-left px-3.5 py-2 text-[13px] flex items-center gap-2 text-[var(--text-dim)] opacity-50 cursor-not-allowed">
                  {opt.flag && <FlagIcon code={opt.flag} />}
                  {opt.label}
                </div>
              );
            }
            return (
              <button key={opt.id} role="option" id={`${listboxId}-opt-${i}`}
                ref={(el) => { optionRefs.current[i] = el; }}
                tabIndex={-1}
                aria-selected={opt.id === value}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => { onChange(opt.id); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-[13px] flex items-center gap-2 transition-colors ${
                  i === activeIndex ? 'ring-1 ring-[var(--amber-300)]' : ''
                } ${
                  opt.id === value
                    ? 'text-[var(--amber-300)] bg-[var(--amber-900)]/50'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                }`}>
                {opt.flag && <FlagIcon code={opt.flag} />}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ConfigSelectorsProps {
  configFormat: ConfigFormat;
  deviceType: DeviceType;
  siteMode: SiteMode;
  endpointId: string;
  customEndpoint: string;
  dnsId: string;
  communityDns: boolean;
  excludeLan: boolean;
  onFormatChange: (v: ConfigFormat) => void;
  onDeviceChange: (v: DeviceType) => void;
  onSiteModeChange: (v: SiteMode) => void;
  onEndpointChange: (id: string) => void;
  onCustomEndpointChange: (v: string) => void;
  onDnsChange: (id: string) => void;
  onExcludeLanChange: (v: boolean) => void;
}

export function ConfigSelectors({
  configFormat, deviceType, siteMode, endpointId, customEndpoint, dnsId, communityDns, excludeLan,
  onFormatChange, onDeviceChange, onSiteModeChange, onEndpointChange, onCustomEndpointChange,
  onDnsChange, onExcludeLanChange,
}: ConfigSelectorsProps) {
  return (
    <div className="space-y-2 mb-3.5">
      <div className="grid grid-cols-2 gap-2 max-[500px]:grid-cols-1 min-[501px]:[&>*:last-child:nth-child(odd)]:col-span-2">
        <Dropdown label="Config format" value={configFormat}
          options={CONFIG_FORMATS.map((f) => ({ id: f.id, label: f.name }))}
          onChange={(v) => onFormatChange(v as ConfigFormat)} />
        <Dropdown label="Connection settings" value={deviceType}
          options={[{ id: 'awg15', label: 'AmneziaWG 1.5' }]}
          onChange={(v) => onDeviceChange(v as DeviceType)} />
        <Dropdown label="DNS" value={dnsId}
          options={DNS_PROVIDERS.map((d) => ({
            id: d.id,
            label: d.isCommunity ? `${d.label} •` : d.label,
          }))}
          onChange={onDnsChange} />
        <Dropdown label="Endpoint" value={endpointId}
          options={ENDPOINTS.map((e) => ({ id: e.id, label: e.label, flag: e.flag }))}
          onChange={onEndpointChange} />
        <Dropdown label="Config type" value={siteMode}
          options={[
            { id: 'all', label: 'All sites' },
            { id: 'specific', label: 'Specific sites', disabled: communityDns },
          ]}
          onChange={(v) => onSiteModeChange(v as SiteMode)} />
      </div>

      {endpointId === 'custom' && (
        <input
          type="text"
          value={customEndpoint}
          onChange={(e) => onCustomEndpointChange(e.target.value)}
          placeholder="host:port (e.g. 162.159.192.1:4500)"
          className="w-full h-10 bg-[var(--surface-2)] rounded-[var(--radius-md)] px-3.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:bg-[var(--surface-3)] transition-colors"
        />
      )}

      {siteMode === 'all' && (
        <div className="pt-1">
          <Toggle checked={excludeLan} onChange={onExcludeLanChange} label="Exclude LAN" />
        </div>
      )}
    </div>
  );
}
