import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DepositsService } from './deposits.service';
import { WalletService, ChainType } from '../wallets/wallet.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BadRequestException } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';

class GetDepositAddressDto {
  @IsEnum(['ETHEREUM', 'BASE'])
  chain: 'ETHEREUM' | 'BASE';

  @IsString()
  @IsNotEmpty()
  token: string;
}

class ManualDepositDto {
  @IsUUID()
  userId: string;

  @IsEnum(['ETHEREUM', 'BASE'])
  chain: 'ETHEREUM' | 'BASE';

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsNotEmpty()
  txHash: string;

  @IsString()
  @IsNotEmpty()
  fromAddress: string;

  @IsString()
  @IsNotEmpty()
  toAddress: string;
}

@ApiTags('deposits')
@Controller('deposits')
export class DepositsController {
  constructor(
    private readonly depositsService: DepositsService,
    private readonly walletService: WalletService,
  ) {}

  @Get('address/:chain/:token')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get deposit address for a chain and token' })
  async getDepositAddress(
    @CurrentUser('sub') userId: string,
    @Param('chain') chain: string,
    @Param('token') token: string,
  ) {
    if (!['ETHEREUM', 'BASE'].includes(chain)) {
      throw new BadRequestException('Invalid chain');
    }

    const supportedTokens = ['ETH', 'USDT', 'USDC'];
    if (!supportedTokens.includes(token.toUpperCase())) {
      throw new BadRequestException('Token not supported for deposits');
    }

    const address = await this.walletService.getUserWalletAddress(userId, chain as ChainType);
    return { chain, token: token.toUpperCase(), address };
  }

  @Get('history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user deposit history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserDeposits(
    @CurrentUser('sub') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.depositsService.getUserDeposits(
      userId,
      parseInt(page, 10),
      Math.min(parseInt(limit, 10), 100),
    );
  }

  @Get('admin/all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List all deposits (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'chain', required: false })
  @ApiQuery({ name: 'token', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listAllDeposits(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('token') token?: string,
    @Query('status') status?: string,
  ) {
    return this.depositsService.listAllDeposits({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      userId,
      chain,
      token,
      status,
    });
  }

  @Post('admin/manual')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Manually credit a deposit (admin)' })
  async manualDeposit(
    @CurrentUser('sub') adminId: string,
    @Body() dto: ManualDepositDto,
  ) {
    return this.depositsService.manualDeposit({
      adminId,
      userId: dto.userId,
      chain: dto.chain,
      token: dto.token.toUpperCase(),
      amount: dto.amount,
      txHash: dto.txHash,
      fromAddress: dto.fromAddress,
      toAddress: dto.toAddress,
    });
  }
}