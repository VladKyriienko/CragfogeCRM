export type DomainEventType =
  | 'record.created'
  | 'record.updated'
  | 'record.deleted'
  | 'record.stage_changed'
  | 'activity.created';

export type DomainEvent = {
  type: DomainEventType;
  workspaceId: string;
  objectId: string;
  objectApiName: string;
  recordId: string;
  actorUserId: string;
  /** Full record snapshot after the change (omitted for delete). */
  record?: {
    id: string;
    name: string;
    ownerId: string;
    data: Record<string, unknown>;
  };
  /** Previous data for updates / stage changes. */
  previousData?: Record<string, unknown>;
  /** Activity payload for activity.created. */
  activity?: {
    id: string;
    type: string;
    subject: string;
    ownerId: string;
  };
  /** When true, automation loop counters still apply but nested automation evaluation is allowed. */
  source?: 'user' | 'automation' | 'system';
  automationId?: string;
};

export type DomainEventListener = (event: DomainEvent) => void | Promise<void>;
