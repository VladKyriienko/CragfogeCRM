import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { Env } from '../config/env';
import { ENV } from '../tokens';
import { BillingController } from './billing.controller';
import { EntitlementsInterceptor } from './entitlements.interceptor';
import { EntitlementsService } from './entitlements.service';
import { LicenseService } from './license.service';
import { StripeBillingService } from './stripe-billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { STRIPE_CLIENT } from './stripe.tokens';

@Global()
@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [
    LicenseService,
    EntitlementsService,
    StripeBillingService,
    {
      provide: STRIPE_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => {
        if (env.DEPLOYMENT_MODE !== 'cloud' || !env.STRIPE_SECRET_KEY) {
          return null;
        }
        // Lazy require so selfhost never constructs a Stripe client.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const StripeCtor = require('stripe') as typeof import('stripe');
        return new StripeCtor(env.STRIPE_SECRET_KEY);
      },
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EntitlementsInterceptor,
    },
  ],
  exports: [EntitlementsService, LicenseService, StripeBillingService],
})
export class BillingModule {}
