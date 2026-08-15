export interface EndpointOption {
  id: string;
  label: string;
  value: string;
  /** If set, clicking this option opens a link instead of using the endpoint */
  externalUrl?: string;
  flag?: string;
}

export const ENDPOINTS: EndpointOption[] = [
  {
    id: 'default',
    label: 'Default',
    value: '162.159.195.1:500',
  },
  {
    id: 'default2',
    label: 'Alternative',
    value: 'engage.cloudflareclient.com:2408',
  },
  {
    id: 'custom',
    label: 'Custom address',
    value: '',
  },
];

export function getEndpointValue(id: string, customValue?: string): string {
  if (id === 'custom') return customValue || 'engage.cloudflareclient.com:4500';
  const ep = ENDPOINTS.find((e) => e.id === id);
  return ep?.value || 'engage.cloudflareclient.com:4500';
}

export function isExternalEndpoint(id: string): string | null {
  const ep = ENDPOINTS.find((e) => e.id === id);
  return ep?.externalUrl ?? null;
}
