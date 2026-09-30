import { All, Controller, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { AUTH } from './auth.tokens';
import type { AuthInstance } from './auth';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@ApiExcludeController()
@Controller('api/auth')
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(AUTH) auth: AuthInstance) {
    this.handler = toNodeHandler(auth);
  }

  @All('*path')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handler(req, res);
  }
}

void SkipThrottle;
