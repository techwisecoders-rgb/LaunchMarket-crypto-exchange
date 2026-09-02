import {
  Body,
  Controller,
  Delete,
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
import { SettingsService } from './settings.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// DTOs
class UpsertTokenDto {
  symbol: string;
  name: string;
  decimals: number;
  chains: string[];
  contractAddress?: string;
  minDeposit?: string;
  minWithdrawal?: string;
  withdrawalFeePercentage?: string;
  isNative?: boolean;
  enabled?: boolean;
  icon?: string;
}

class TokenStatusDto {
  enabled: boolean;
}

class UpsertChainDto {
  chain: string;
  name: string;
  rpcUrl: string;
  chainId: number;
  blockConfirmations: number;
  pollingIntervalMs: number;
  explorerUrl: string;
  enabled?: boolean;
}

class ChainStatusDto {
  enabled: boolean;
}

class UpsertTradingPairDto {
  baseToken: string;
  quoteToken: string;
  chain: string;
  symbol: string;
  enabled?: boolean;
  minOrderSize: string;
  maxOrderSize: string;
  priceDecimals?: number;
  quantityDecimals?: number;
  makerFee?: string;
  takerFee?: string;
}

class TradingPairStatusDto {
  enabled: boolean;
}

class SetSettingDto {
  key: string;
  value: string;
  category: string;
  isPublic?: boolean;
}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ============================================================
  // Public endpoints
  // ============================================================

  @Public()
  @Get('tokens')
  @ApiOperation({ summary: 'List supported tokens (public)' })
  async listTokens() {
    const tokens = await this.settingsService.listTokens();
    return tokens.filter((t) => t.enabled);
  }

  @Public()
  @Get('tokens/:symbol')
  @ApiOperation({ summary: 'Get token config (public)' })
  async getToken(@Param('symbol') symbol: string) {
    return this.settingsService.getToken(symbol);
  }

  @Public()
  @Get('chains')
  @ApiOperation({ summary: 'List supported chains (public)' })
  async listChains() {
    const chains = await this.settingsService.listChains();
    return chains.filter((c) => c.enabled);
  }

  @Public()
  @Get('trading-pairs')
  @ApiOperation({ summary: 'List trading pairs (public)' })
  async listTradingPairs(@Query('enabled') enabledOnly = 'true') {
    return this.settingsService.listTradingPairs(enabledOnly === 'true');
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Get public system settings' })
  async getPublicSettings() {
    return this.settingsService.getSystemSettings(true);
  }

  // ============================================================
  // Admin endpoints
  // ============================================================

  @Get('all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all system settings (admin)' })
  async getAllSettings() {
    return this.settingsService.getSystemSettings(false);
  }

  @Post('tokens')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create or update a token config (admin)' })
  async upsertToken(
    @Body() dto: UpsertTokenDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.settingsService.upsertToken({
      ...dto,
      updatedBy: adminId,
    });
  }

  @Post('tokens/:symbol/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Enable/disable a token (admin)' })
  async setTokenStatus(
    @Param('symbol') symbol: string,
    @Body() dto: TokenStatusDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.settingsService.setTokenStatus(symbol, dto.enabled, adminId);
  }

  @Post('chains')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create or update a chain config (admin)' })
  async upsertChain(@Body() dto: UpsertChainDto) {
    return this.settingsService.upsertChain(dto);
  }

  @Post('chains/:chain/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Enable/disable a chain (admin)' })
  async setChainStatus(
    @Param('chain') chain: string,
    @Body() dto: ChainStatusDto,
  ) {
    return this.settingsService.setChainStatus(chain, dto.enabled);
  }

  @Post('trading-pairs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create or update a trading pair (admin)' })
  async upsertTradingPair(
    @Body() dto: UpsertTradingPairDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.settingsService.upsertTradingPair({
      ...dto,
      updatedBy: adminId,
    });
  }

  @Post('trading-pairs/:symbol/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Enable/disable a trading pair (admin)' })
  async setTradingPairStatus(
    @Param('symbol') symbol: string,
    @Body() dto: TradingPairStatusDto,
  ) {
    return this.settingsService.setTradingPairStatus(symbol, dto.enabled);
  }

  @Post('system')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Set a system setting (admin)' })
  async setSetting(
    @Body() dto: SetSettingDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.settingsService.setSetting({
      ...dto,
      updatedBy: adminId,
    });
  }

  @Delete('system/:key')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a system setting (admin)' })
  async deleteSetting(@Param('key') key: string) {
    return this.settingsService.deleteSetting(key);
  }
}