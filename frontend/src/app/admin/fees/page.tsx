'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feesApi, type FeeConfig } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminFeesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});

  const { data: fees, isLoading } = useQuery({
    queryKey: ['admin-fees'],
    queryFn: feesApi.getAll,
  });

  const updateFee = useMutation({
    mutationFn: ({ fee, percentage }: { fee: FeeConfig; percentage: number }) =>
      feesApi.update({
        type: fee.type,
        chain: fee.chain,
        token: fee.token,
        percentage,
      }),
    onSuccess: () => {
      toast.success('Fee updated');
      setEditing({});
      queryClient.invalidateQueries({ queryKey: ['admin-fees'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update fee'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fee Management</h1>
        <p className="text-muted-foreground">Configure withdrawal and trading fees</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : fees && fees.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Token</th>
                    <th className="pb-3 font-medium">Fee (%)</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((fee: FeeConfig) => (
                    <tr key={fee.id} className="border-b border-border/30">
                      <td className="py-3 font-medium">{fee.type}</td>
                      <td className="py-3">{fee.chain}</td>
                      <td className="py-3">{fee.token}</td>
                      <td className="py-3">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8 w-28"
                          value={editing[fee.id] ?? fee.percentage}
                          onChange={(e) =>
                            setEditing((prev) => ({ ...prev, [fee.id]: e.target.value }))
                          }
                        />
                      </td>
                      <td className="py-3">
                        <Badge variant={fee.status === 'ACTIVE' ? 'green' : 'outline'}>{fee.status}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={updateFee.isPending}
                          onClick={() =>
                            updateFee.mutate({ fee, percentage: Number(editing[fee.id] ?? fee.percentage) })
                          }
                        >
                          <Save className="h-3.5 w-3.5" /> Save
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No fee configurations found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}