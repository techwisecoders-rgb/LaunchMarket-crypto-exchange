'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type ChainConfig } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminBlockchainPage() {
  const queryClient = useQueryClient();

  const { data: chains, isLoading } = useQuery({
    queryKey: ['admin-chains'],
    queryFn: settingsApi.getChains,
  });

  const toggle = useMutation({
    mutationFn: ({ chain, enabled }: { chain: string; enabled: boolean }) =>
      settingsApi.setChainStatus(chain, enabled),
    onSuccess: () => {
      toast.success('Chain configuration updated');
      queryClient.invalidateQueries({ queryKey: ['admin-chains'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update chain'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Blockchain Monitoring</h1>
        <p className="text-muted-foreground">RPC endpoints, polling status, and chain health</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : chains && chains.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Chain ID</th>
                    <th className="pb-3 font-medium">Confirmations</th>
                    <th className="pb-3 font-medium">Poll Interval</th>
                    <th className="pb-3 font-medium">Last Block</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {chains.map((c: ChainConfig) => (
                    <tr key={c.id} className="border-b border-border/30">
                      <td className="py-3 font-medium">{c.chain}</td>
                      <td className="py-3">{c.name}</td>
                      <td className="py-3 text-muted-foreground">{c.chainId}</td>
                      <td className="py-3 text-muted-foreground">{c.blockConfirmations}</td>
                      <td className="py-3 text-muted-foreground">
                        {c.pollingIntervalMs ? `${Math.round(c.pollingIntervalMs / 1000)}s` : '—'}
                      </td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {c.lastPolledBlock ?? '—'}
                      </td>
                      <td className="py-3">
                        <Badge variant={c.enabled ? 'green' : 'destructive'}>
                          {c.enabled ? 'MONITORING' : 'DISABLED'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant={c.enabled ? 'destructive' : 'default'}
                          onClick={() => toggle.mutate({ chain: c.chain, enabled: !c.enabled })}
                          disabled={toggle.isPending}
                        >
                          {c.enabled ? 'Pause' : 'Resume'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No chain configurations found</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-2 font-medium">RPC Endpoints</h3>
          <div className="space-y-2">
            {chains?.map((c: ChainConfig) => (
              <div key={c.id} className="rounded-lg border border-border/40 p-3 font-mono text-xs">
                <span className="text-muted-foreground">{c.chain}: </span>
                {c.rpcUrl}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}