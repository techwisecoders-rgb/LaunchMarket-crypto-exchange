import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FeesService } from './fees.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class UpsertFeeDto {
  type: 'WITHDRAWAL' | 'TRADING' | 'DEPOSIT';
  chain: string;
  token: string;
  percentage: string;
  fixedAmount?: string;
  minAmount?: string;
  maxAmount?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

@ApiTags('fees')
@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all fee configurations (public)' })
  async listFees() {
    return this.feesService.listFees();
  }

  @Get(':type/:chain/:token')
  @ApiOperation({ summary: 'Get fee for a specific type/chain/token' })
  async getFee(
    @Param('type') type: string,
    @Param('chain') chain: string,
    @Param('token') token: string,
  ) {
    return this.feesService.getFee({
      type: type as 'WITHDRAWAL',
      chain,
      token: token.toUpperCase(),
    });
  }

  @Post('admin/upsert')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create or update a fee (admin)' })
  async upsertFee(@CurrentUser('sub') adminId: string, @Body() dto: UpsertFeeDto) {
    return this.feesService.upsertFee({
      ...dto,
      token: dto.token.toUpperCase(),
      updatedBy: adminId,
    });
  }

  @Delete('admin/:type/:chain/:token')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a fee config (admin)' })
  async deleteFee(
    @Param('type') type: string,
    @Param('chain') chain: string,
    @Param('token') token: string,
  ) {
    return this.feesService.deleteFee(type, chain, token.toUpperCase());
  }
}