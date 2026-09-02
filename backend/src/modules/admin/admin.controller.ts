import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class SetUserStatusDto {
  status: string;
  reason?: string;
}

class ManualAdjustmentDto {
  userId: string;
  chain: string;
  token: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string;
  reason: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============================================================
  // Dashboard
  // ============================================================

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard stats' })
  async getDashboard() {
    return this.adminService.getDashboard();
  }

  // ============================================================
  // User Management
  // ============================================================

  @Get('users')
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'role', required: false })
  async listUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.listUsers({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      search,
      status,
      role,
    });
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user detail' })
  async getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Post('users/:id/status')
  @ApiOperation({ summary: 'Set user status (freeze, block, enable, disable)' })
  async setUserStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminService.setUserStatus(id, dto.status, adminId, dto.reason);
  }

  // ============================================================
  // Manual Credit / Debit
  // ============================================================

  @Post('balance/adjust')
  @ApiOperation({ summary: 'Manual credit or debit a user balance' })
  async manualAdjustment(
    @Body() dto: ManualAdjustmentDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminService.manualBalanceAdjustment({
      adminUserId: adminId,
      userId: dto.userId,
      chain: dto.chain,
      token: dto.token,
      type: dto.type,
      amount: dto.amount,
      reason: dto.reason,
    });
  }

  // ============================================================
  // List views
  // ============================================================

  @Get('deposits')
  @ApiOperation({ summary: 'List all deposits' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'chain', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listDeposits(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listDeposits({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      userId,
      chain,
      status,
    });
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'List all withdrawals' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'chain', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listWithdrawals(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listWithdrawals({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      userId,
      chain,
      status,
    });
  }

  @Get('trades')
  @ApiOperation({ summary: 'List all trades' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'chain', required: false })
  @ApiQuery({ name: 'token', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listTrades(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('token') token?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listTrades({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      userId,
      chain,
      token,
      status,
    });
  }

  @Get('wallets')
  @ApiOperation({ summary: 'List all wallets (private keys never exposed)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'chain', required: false })
  @ApiQuery({ name: 'userId', required: false })
  async listWallets(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('chain') chain?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.listWallets({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      chain,
      userId,
    });
  }

  // ============================================================
  // Blockchain monitoring
  // ============================================================

  @Get('blockchain/status')
  @ApiOperation({ summary: 'Blockchain network status' })
  async getBlockchainStatus() {
    return this.adminService.getBlockchainStatus();
  }

  @Get('blockchain/transactions')
  @ApiOperation({ summary: 'List blockchain transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'chain', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listBlockchainTransactions(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('chain') chain?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listBlockchainTransactions({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      chain,
      status,
    });
  }

  // ============================================================
  // Analytics
  // ============================================================

  @Get('analytics')
  @ApiOperation({ summary: 'Platform analytics' })
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }
}