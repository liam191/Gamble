import { Header } from "@/components/Header";
import { Game } from "@/components/Game";
import { RecentBets } from "@/components/RecentBets";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1" style={{ padding: 'var(--space-4) var(--space-4)', maxWidth: '100%' }}>
        <div className="max-w-lg mx-auto" style={{ paddingTop: 'var(--space-6)' }}>
          <Game />
          <section style={{ marginTop: 'var(--space-10)' }}>
            <h2
              className="font-heading"
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                marginBottom: 'var(--space-3)',
              }}
            >
              Recent Bets
            </h2>
            <div
              style={{
                background: 'var(--surface-1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--surface-3)',
                overflow: 'hidden',
              }}
            >
              <RecentBets />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
