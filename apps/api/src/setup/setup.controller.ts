import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SetupService } from './setup.service';

@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether this instance still needs a first Owner' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['needsSetup'],
      properties: { needsSetup: { type: 'boolean' } },
    },
  })
  status() {
    return this.setup.status();
  }
}
