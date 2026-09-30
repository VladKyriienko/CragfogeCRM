import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  eq,
  stripeWebhookEvents,
  workspaces,
  type AppDatabase,
  type BillingStatus,
} from '@cragfoge/db';
import {
  checkoutSessionSchema,
  portalSessionSchema,
  type CheckoutSessionDto,
  type PortalSessionDto,
} from '@cragfoge/shared';
import type Stripe from 'stripe';
import type { Env } from '../config/env';
import { APP_DB, ENV } from '../tokens';
import { EntitlementsService } from './entitlements.service';
import { STRIPE_CLIENT } from './stripe.tokens';

@Injectable()
export class StripeBillingService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(ENV) private readonly env: Env,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Optional() @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  private requireStripe(): Stripe {
    if (this.env.DEPLOYMENT_MODE !== 'cloud' || !this.stripe) {
      throw new ServiceUnavailableException('Stripe billing is not available in this deployment');
    }
    return this.stripe;
  }

  async createCheckoutSession(workspaceId: string, userEmail: string): Promise<CheckoutSessionDto> {
    const stripe = this.requireStripe();
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const seatsUsed = await this.entitlements.countMembers(workspaceId);
    const quantity = Math.max(1, seatsUsed);

    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { workspace_id: workspaceId },
      });
      customerId = customer.id;
      await this.db
        .update(workspaces)
        .set({ stripeCustomerId: customerId })
        .where(eq(workspaces.id, workspaceId));
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: workspaceId,
      line_items: [{ price: this.env.STRIPE_PRICE_ID!, quantity }],
      success_url: `${this.env.WEB_ORIGIN}/settings?billing=success`,
      cancel_url: `${this.env.WEB_ORIGIN}/settings?billing=cancel`,
      metadata: { workspace_id: workspaceId },
      subscription_data: {
        metadata: { workspace_id: workspaceId },
      },
    });

    if (!session.url) {
      throw new BadRequestException('Stripe Checkout did not return a URL');
    }
    return checkoutSessionSchema.parse({ url: session.url });
  }

  async createPortalSession(workspaceId: string): Promise<PortalSessionDto> {
    const stripe = this.requireStripe();
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer for this workspace');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: `${this.env.WEB_ORIGIN}/settings`,
    });
    return portalSessionSchema.parse({ url: session.url });
  }

  async syncSeatQuantity(workspaceId: string): Promise<void> {
    if (this.env.DEPLOYMENT_MODE !== 'cloud' || !this.stripe) {
      return;
    }
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace?.stripeSubscriptionId) {
      return;
    }

    const seatsUsed = await this.entitlements.countMembers(workspaceId);
    const quantity = Math.max(1, seatsUsed);
    const subscription = await this.stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (!item) {
      return;
    }
    await this.stripe.subscriptions.update(workspace.stripeSubscriptionId, {
      items: [{ id: item.id, quantity }],
      proration_behavior: 'create_prorations',
    });
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    const stripe = this.requireStripe();
    if (!this.env.STRIPE_WEBHOOK_SECRET) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, this.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    const [existing] = await this.db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id))
      .limit(1);
    if (existing) {
      return { received: true };
    }

    await this.applyEvent(event);

    await this.db.insert(stripeWebhookEvents).values({
      eventId: event.id,
      type: event.type,
    });

    return { received: true };
  }

  /** Apply a verified Stripe event (also used by unit tests with fixtures). */
  async applyEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const workspaceId = session.metadata?.workspace_id ?? session.client_reference_id ?? undefined;
    if (!workspaceId) {
      return;
    }
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

    await this.db
      .update(workspaces)
      .set({
        billingStatus: 'active',
        plan: 'pro',
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        pastDueSince: null,
      })
      .where(eq(workspaces.id, workspaceId));
  }

  private async onSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const workspace = await this.findWorkspaceForSubscription(subscription);
    if (!workspace) {
      return;
    }
    const status = this.mapSubscriptionStatus(subscription.status);
    await this.db
      .update(workspaces)
      .set({
        billingStatus: status,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId:
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id,
        pastDueSince:
          status === 'past_due'
            ? (workspace.pastDueSince ?? new Date())
            : status === 'active'
              ? null
              : workspace.pastDueSince,
        plan: status === 'canceled' ? workspace.plan : 'pro',
      })
      .where(eq(workspaces.id, workspace.id));
  }

  private async onSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const workspace = await this.findWorkspaceForSubscription(subscription);
    if (!workspace) {
      return;
    }
    await this.db
      .update(workspaces)
      .set({
        billingStatus: 'canceled',
        pastDueSince: null,
      })
      .where(eq(workspaces.id, workspace.id));
  }

  private async onInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) {
      return;
    }
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.stripeCustomerId, customerId))
      .limit(1);
    if (!workspace) {
      return;
    }
    await this.db
      .update(workspaces)
      .set({
        billingStatus: 'past_due',
        pastDueSince: workspace.pastDueSince ?? new Date(),
      })
      .where(eq(workspaces.id, workspace.id));
  }

  private async findWorkspaceForSubscription(subscription: Stripe.Subscription) {
    const fromMeta = subscription.metadata?.workspace_id;
    if (fromMeta) {
      const [byMeta] = await this.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, fromMeta))
        .limit(1);
      if (byMeta) {
        return byMeta;
      }
    }
    const [bySub] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.stripeSubscriptionId, subscription.id))
      .limit(1);
    if (bySub) {
      return bySub;
    }
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const [byCustomer] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.stripeCustomerId, customerId))
      .limit(1);
    return byCustomer ?? null;
  }

  private mapSubscriptionStatus(status: Stripe.Subscription.Status): BillingStatus {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'active';
      case 'past_due':
      case 'unpaid':
        return 'past_due';
      case 'canceled':
      case 'incomplete_expired':
        return 'canceled';
      default:
        return 'past_due';
    }
  }
}
