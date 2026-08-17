import { SERVICES } from '@/config/services-loader';
import { HomeClient } from '@/components/home-client';

export default function Home() {
  return (
    <>
      <div className="max-w-[1100px] mx-auto px-4 pt-4">
        <div className="bg-[var(--warning)]/10 border border-[var(--warning)]/40 rounded-[var(--radius-md)] p-3 text-[13px] text-[var(--text)]">
          <p className="font-medium text-[var(--warning)]">This page is retired.</p>
          <p className="text-[var(--text-muted)] mt-0.5">
            The Next.js UI is unmaintained (ADR 0004). The live panel with the
            generator tab is served by the Cloudflare Worker behind a password
            gate — run <code className="text-[var(--text)]">wrangler dev</code> or{' '}
            <code className="text-[var(--text)]">wrangler deploy</code>.
          </p>
        </div>
      </div>
      <HomeClient services={SERVICES} />
    </>
  );
}
