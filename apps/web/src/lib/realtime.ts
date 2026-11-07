import { NotificationPushSchema } from '@itsm/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './auth';
export function useRealtime() {
  const { token } = useAuth();
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!token) return;
    const socket = io('/realtime', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('notification', (payload: unknown) => {
      const result = NotificationPushSchema.safeParse(payload);
      if (!result.success) return;
      void client.invalidateQueries({ queryKey: ['notifications'] });
      void client.invalidateQueries({ queryKey: ['incidents'] });
      const id = result.data.notification.incident?.id;
      if (id) {
        void client.invalidateQueries({ queryKey: ['incident', id] });
        void client.invalidateQueries({ queryKey: ['incident-audit', id] });
      }
    });
    socket.on('incident.updated', (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('incidentId' in payload) ||
        typeof payload.incidentId !== 'string' ||
        !('type' in payload) ||
        typeof payload.type !== 'string'
      )
        return;
      void client.invalidateQueries({ queryKey: ['incident', payload.incidentId] });
      void client.invalidateQueries({ queryKey: ['incident-audit', payload.incidentId] });
      void client.invalidateQueries({ queryKey: ['incidents'] });
      void client.invalidateQueries({ queryKey: ['reports'] });
      void client.invalidateQueries({ queryKey: ['sla-risk'] });
      void client.invalidateQueries({ queryKey: ['audit'] });
    });
    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [token, client]);
  return { connected };
}
