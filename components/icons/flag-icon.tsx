'use client';

import { DE, NL, FI, PL, LV } from 'country-flag-icons/react/3x2';
import type { ComponentType, SVGProps } from 'react';

const FLAGS: Record<string, typeof DE> = {
  DE,
  NL,
  FI,
  PL,
  LV,
};

interface FlagIconProps {
  code: string;
  size?: number;
}

export function FlagIcon({ code, size = 20 }: FlagIconProps) {
  const FlagComponent = FLAGS[code.toUpperCase()];
  const h = Math.round(size * 0.67);

  if (!FlagComponent) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: h,
          background: 'var(--surface-3)',
          borderRadius: 3,
        }}
      />
    );
  }

  return (
    <FlagComponent
      style={{
        width: size,
        height: h,
        borderRadius: 3,
        display: 'block',
      }}
    />
  );
}