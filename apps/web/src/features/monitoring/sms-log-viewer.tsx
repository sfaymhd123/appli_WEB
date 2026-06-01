import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/axios';
import { Card, CardHeader, CardBody, Badge, Spinner } from '../../components/ui';
import { shortDateTime } from './monitoring-display';

interface SmsLogEntry {
  id: string;
  at: string;
  to: string;
  body: string;
  provider: string;
}

export function SmsLogViewer() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sms', 'logs'],
    queryFn: async (): Promise<SmsLogEntry[]> => {
      const { data } = await api.get<SmsLogEntry[]>('/sms/logs');
      return data;
    },
    refetchInterval: 5000, // Poll every 5s for the PoC
  });

  if (isError) return null; // Silent fail (it's a debug tool)

  return (
    <Card>
      <CardHeader
        title="Journal des SMS envoyés (Simulation)"
        description="Les SMS ne sont pas réellement envoyés en mode démo ; ils sont capturés ici en temps réel."
        action={<Badge tone="neutral">{data?.length ?? 0}</Badge>}
      />
      <CardBody>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : data?.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">Aucun SMS envoyé.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data?.map((log) => (
              <li key={log.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-clinical-700">Vers {log.to}</p>
                  <span className="text-[10px] text-gray-400">{shortDateTime(log.at)}</span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{log.body}</p>
                <p className="mt-0.5 text-[10px] font-mono text-gray-300">Provider: {log.provider} · ID: {log.id}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
