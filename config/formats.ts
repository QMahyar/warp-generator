import type { ConfigFormat, ConfigFormatInfo } from '@/types';

export const CONFIG_FORMATS: ConfigFormatInfo[] = [
  {
    id: 'wireguard',
    name: 'AmneziaWG',
    description: 'Standard WireGuard format (.conf)',
    extension: 'conf',
    supportsQR: true,
  },
  {
    id: 'throne',
    name: 'Throne',
    description: 'WireGuard configuration for Throne (wg://)',
    extension: 'txt',
    supportsQR: true,
  },
  {
    id: 'clash',
    name: 'Clash',
    description: 'Configuration for Clash Meta (.yaml)',
    extension: 'yaml',
    supportsQR: false,
  },
  {
    id: 'nekoray',
    name: 'NekoRay',
    description: 'Configuration for NekoRay (.json)',
    extension: 'json',
    supportsQR: false,
  },
  {
    id: 'husi',
    name: 'Husi',
    description: 'Configuration for Husi (.json)',
    extension: 'json',
    supportsQR: false,
  },
  {
    id: 'karing',
    name: 'Karing',
    description: 'Configuration for Karing (.json)',
    extension: 'json',
    supportsQR: false,
  },
  {
    id: 'wiresock',
    name: 'WireSock',
    description: 'WireGuard with protocol masking (.conf)',
    extension: 'conf',
    supportsQR: true,
  },
];

export function getFormatInfo(format: ConfigFormat): ConfigFormatInfo {
  const info = CONFIG_FORMATS.find((f) => f.id === format);
  if (!info) throw new Error(`Unknown format: ${format}`);
  return info;
}

export function getFileName(format: ConfigFormat): string {
  const info = getFormatInfo(format);
  const id = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  const prefix = format === 'wireguard' ? 'WARP' : format.toUpperCase();
  return `${prefix}${id}.${info.extension}`;
}

export function supportsQR(format: ConfigFormat): boolean {
  return getFormatInfo(format).supportsQR;
}
