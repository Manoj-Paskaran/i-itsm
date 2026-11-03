import type { AuditRecord } from '../domain/audit/index.js';

export interface AuditSink {
  append(record: AuditRecord): Promise<void>;
}
