'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface AuditItem {
  id: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export default function AdminAuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => adminApi.auditLogs(1, 100),
  });

  const items = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">Security and compliance audit trail</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Action</th>
                    <th className="pb-3 font-medium">User</th>
                    <th className="pb-3 font-medium">IP Address</th>
                    <th className="pb-3 font-medium">User Agent</th>
                    <th className="pb-3 font-medium">Details</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log: AuditItem) => (
                    <tr key={log.id} className="border-b border-border/30">
                      <td className="py-2.5">
                        <Badge variant="outline">{log.action}</Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {log.userEmail ?? log.userId ?? 'System'}
                      </td>
                      <td className="py-2.5 font-mono text-xs text-muted-foreground">
                        {log.ipAddress ?? '—'}
                      </td>
                      <td className="max-w-[200px] truncate py-2.5 text-xs text-muted-foreground">
                        {log.userAgent ?? '—'}
                      </td>
                      <td className="max-w-[250px] truncate py-2.5 text-xs text-muted-foreground">
                        {log.meta ? JSON.stringify(log.meta) : '—'}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No audit logs yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}