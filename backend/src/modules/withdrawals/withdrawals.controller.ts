import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WithdrawalsService } from './withdrawals.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class RequestWithdrawalDto {
  chain: 'ETHEREUM' | 'BASE';
  token: string;
  amount: string;
  address: string;
}

class VerifyWithdrawalDto {
  requestId: string;
  code: string;
}

@ApiTags('withdrawals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('request')
  @ApiOperation({ summary: 'Request a withdrawal (step 1: sends OTP)' })
  async requestWithdrawal(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestWithdrawalDto,
    @Req() req: Request,
  ) {
    return this.withdrawalsService.requestWithdrawal({
      userId,
      chain: dto.chain,
      token: dto.token,
      amount: dto.amount,
      address: dto.address,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify OTP and execute withdrawal (step 2)' })
  async verifyAndExecute(
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyWithdrawalDto,
    @Req() req: Request,
  ) {
    return this.withdrawalsService.verifyAndExecuteWithdrawal({
      userId,
      requestId: dto.requestId,
      code: dto.code,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':requestId/resend-otp')
  @ApiOperation({ summary: 'Resend OTP for a pending withdrawal request' })
  async resendOtp(
    @CurrentUser('sub') userId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.withdrawalsService.resendOtp(userId, requestId);
  }

  @Post(':requestId/cancel')
  @ApiOperation({ summary: 'Cancel a pending withdrawal request' })
  async cancelRequest(
    @CurrentUser('sub') userId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.withdrawalsService.cancelWithdrawalRequest(userId, requestId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get user withdrawal history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserWithdrawals(
    @CurrentUser('sub') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.withdrawalsService.getUserWithdrawals(
      userId,
      parseInt(page, 10),
      Math.min(parseInt(limit, 10), 100),
    );
  }

  @Get('requests')
  @ApiOperation({ summary: 'Get user pending withdrawal requests' })
  async getUserWithdrawalRequests(@CurrentUser('sub') userId: string) {
    return this.withdrawalsService.getUserWithdrawalRequests(userId);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List all withdrawals (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'chain', required: false })
  @ApiQuery({ name: 'token', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listAllWithdrawals(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('token') token?: string,
    @Query('status') status?: string,
  ) {
    return this.withdrawalsService.listAllWithdrawals({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      userId,
      chain,
      token,
      status,
    });
  }
}