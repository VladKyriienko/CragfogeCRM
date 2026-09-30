import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@cragfoge/shared';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check database and Redis' })
  @ApiOkResponse({
    description: 'The API can reach Postgres and Redis.',
    schema: {
      type: 'object',
      required: ['status', 'checks'],
      properties: {
        status: { type: 'string', enum: ['ok', 'error'] },
        checks: {
          type: 'object',
          required: ['database', 'redis'],
          properties: {
            database: { type: 'string', enum: ['ok', 'error'] },
            redis: { type: 'string', enum: ['ok', 'error'] },
          },
        },
      },
    },
  })
  async getHealth(): Promise<HealthResponse> {
    const body = await this.health.check();
    if (body.status !== 'ok') {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
