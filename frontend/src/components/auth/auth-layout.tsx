import Link from 'next/link';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="crypto-grid-bg flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-center border-b border-border/60 bg-background/80 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sidra-blue to-sidra-gold font-bold text-white">
            S
          </div>
          <span className="text-xl font-bold tracking-tight">
            LAUNCHMARKET<span className="text-sidra-gold"> CRYPTO EXCHANGE</span>
          </span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="glass-panel w-full max-w-md rounded-xl p-8 shadow-xl">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}