import { Controller, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { StripeBillingService } from './stripe-billing.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiExcludeController()
@Controller('billing/webhooks')
export class StripeWebhookController {
  constructor(@Inject(StripeBillingService) private readonly stripeBilling: StripeBillingService) {}

  @Post('stripe')
  @HttpCode(200)
  handle(@Req() req: RawBodyRequest, @Headers('stripe-signature') signature: string | undefined) {
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return this.stripeBilling.handleWebhook(Buffer.alloc(0), signature ?? '');
    }
    return this.stripeBilling.handleWebhook(rawBody, signature ?? '');
  }
}
