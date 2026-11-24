import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { HealthResponseDto } from './health.dto';

const VERSION = process.env.npm_package_version ?? '0.1.0';

// Sem login: é a rota que o load balancer e o monitoramento chamam.
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime() * 10) / 10,
      version: VERSION,
    };
  }
}
