import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAuditLogs, AuditLog } from '@/services/auditService';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      const data = await getAuditLogs(50);
      setLogs(data);
      setLoading(false);
    };

    loadLogs();
  }, []);

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      invite_sales_rep: 'bg-blue-500',
      create_customer: 'bg-green-500',
      update_customer: 'bg-yellow-500',
      delete_customer: 'bg-red-500',
      login: 'bg-purple-500',
      logout: 'bg-gray-500',
    };

    return (
      <Badge className={colors[action] || 'bg-gray-500'}>
        {action.replace(/_/g, ' ').toUpperCase()}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No audit logs found</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between border-b pb-4 last:border-0"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getActionBadge(log.action)}
                    <span className="text-sm font-medium">{log.resource_type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {log.new_data && typeof log.new_data === 'object' && (
                      <span className="font-mono text-xs">
                        {JSON.stringify(log.new_data, null, 2).substring(0, 100)}...
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(log.created_at), 'PPpp')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
