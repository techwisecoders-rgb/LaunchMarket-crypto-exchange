import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  async health() {
    let database = 'UP';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'DOWN';
    }

    return {
      status: 'ok',
      service: this.configService.get<string>('APP_NAME', 'LaunchMarket Crypto Exchange'),
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database,
      environment: process.env.NODE_ENV ?? 'development',
    };
  }
}