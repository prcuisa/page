import { z } from "zod";
export const channelSchema = z.enum([
  "telegram",
  "whatsapp",
  "email",
  "inapp",
  "push",
  "webhook",
]);
export const eventSchema = z
  .object({
    event_id: z.uuid(),
    event_type: z.enum([
      "pos.sale.completed.v1",
      "invoice.issued.v1",
      "invoice.payment.recorded.v1",
      "invoice.payment.reversed.v1",
      "quotation.accepted.v1",
      "finance.income.recorded.v1",
      "finance.expense.recorded.v1",
      "qr.created.v1",
    ]),
    schema_version: z.literal(1),
    source_app: z.enum([
      "kasir-pinter",
      "invoice-quotation",
      "business-report",
      "qr",
    ]),
    workspace_id: z.uuid(),
    actor_user_id: z.uuid().nullable(),
    aggregate_id: z.uuid(),
    occurred_at: z.iso.datetime(),
    correlation_id: z.uuid(),
    idempotency_key: z.string().min(1).max(200),
    payload: z.object({ entity_id: z.uuid() }).strict(),
  })
  .strict();
export type ChannelType = z.infer<typeof channelSchema>;
export interface DeliveryRequest {
  deliveryId: string;
  channel: ChannelType;
  recipientId: string;
  workspaceId: string;
  templateKey: string;
  locale: string;
  payload: Record<string, unknown>;
}
export interface DeliveryResult {
  accepted: boolean;
  providerMessageId?: string;
  retryable: boolean;
  errorCode?: string;
}
export interface ChannelAdapter {
  send(request: DeliveryRequest): Promise<DeliveryResult>;
}
// External adapters must not be registered until recipient verification and send-time
// authorization are implemented. This contract does not imply provider availability.
export const retryDelaySeconds = [0, 60, 300, 900, 3600] as const;
