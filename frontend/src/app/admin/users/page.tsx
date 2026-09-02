'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type UserProfile } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';

type StatusAction = 'ACTIVE' | 'FROZEN' | 'BLOCKED' | 'DISABLED';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => adminApi.listUsers(1, 50, search || undefined),
  });

  const updateStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: StatusAction }) =>
      adminApi.updateUserStatus(userId, status),
    onSuccess: () => {
      toast.success('User status updated');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update user status');
    },
  });

  const badgeVariant = (status: string) =>
    status === 'ACTIVE' ? 'green' : status === 'FROZEN' ? 'outline' : 'destructive';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">Freeze, block, enable, or disable user accounts</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : data && data.data && data.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Role</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Verified</th>
                    <th className="pb-3 font-medium">Joined</th>
                    <th className="pb-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((user: UserProfile) => (
                    <tr key={user.id} className="border-b border-border/30">
                      <td className="py-3 font-medium">{user.email}</td>
                      <td className="py-3">
                        <Badge variant={user.role === 'SUPER_ADMIN' ? 'gold' : user.role === 'ADMIN' ? 'default' : 'outline'}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge variant={badgeVariant(user.status)}>{user.status}</Badge>
                      </td>
                      <td className="py-3">{user.emailVerified ? 'Yes' : 'No'}</td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {user.status === 'ACTIVE' ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateStatus.mutate({ userId: user.id, status: 'FROZEN' })}
                                disabled={updateStatus.isPending}
                              >
                                Freeze
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => updateStatus.mutate({ userId: user.id, status: 'BLOCKED' })}
                                disabled={updateStatus.isPending}
                              >
                                Block
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => updateStatus.mutate({ userId: user.id, status: 'ACTIVE' })}
                              disabled={updateStatus.isPending}
                            >
                              Enable
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No users found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}