import {
  BadRequestException,
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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class CreateSellOrderDto {
  chain: 'ETHEREUM' | 'BASE';
  /** The token being sold (alias: baseToken). */
  token?: string;
  /** Preferred: the token being sold. */
  baseToken?: string;
  /** The token used to price the order. Defaults to USDT. */
  quoteToken?: string;
  quantity: string;
  price: string;
  expiresInHours?: number;
}

class CounterOfferDto {
  price: string;
  quantity?: string;
}

class RespondCounterOfferDto {
  action: 'ACCEPT' | 'REJECT';
}

class CounterCounterOfferDto {
  price: string;
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('sell')
  @ApiOperation({ summary: 'Create a sell order (seller)' })
  async createSellOrder(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSellOrderDto,
    @Req() req: Request,
  ) {
    const token = (dto.baseToken ?? dto.token ?? '').toString().trim();
    if (!token) {
      throw new BadRequestException('baseToken (or token) is required');
    }
    return this.ordersService.createSellOrder({
      userId,
      chain: dto.chain,
      token,
      quoteToken: dto.quoteToken,
      quantity: dto.quantity,
      price: dto.price,
      expiresInHours: dto.expiresInHours,
    });
  }

  @Get('marketplace')
  @ApiOperation({ summary: 'List marketplace orders' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'symbol', required: false, description: 'e.g. ETH/USDT or ETH/USDT-BASE' })
  @ApiQuery({ name: 'baseToken', required: false })
  @ApiQuery({ name: 'quoteToken', required: false })
  @ApiQuery({ name: 'token', required: false })
  @ApiQuery({ name: 'chain', required: false })
  async listMarketplaceOrders(
    @CurrentUser('sub') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('symbol') symbol?: string,
    @Query('baseToken') baseToken?: string,
    @Query('quoteToken') quoteToken?: string,
    @Query('token') token?: string,
    @Query('chain') chain?: string,
  ) {
    return this.ordersService.listMarketplaceOrders({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      symbol,
      baseToken,
      quoteToken,
      token,
      chain,
      status: 'OPEN',
      excludeUserId: userId,
    });
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my orders (as seller)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserOrders(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ordersService.getUserOrders(
      userId,
      status,
      parseInt(page, 10),
      Math.min(parseInt(limit, 10), 100),
    );
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get a single order with counter offers' })
  async getOrder(@Param('orderId') orderId: string) {
    return this.ordersService.getOrder(orderId);
  }

  @Post(':orderId/accept')
  @ApiOperation({ summary: 'Buyer accepts the seller price (executes trade)' })
  async acceptOrder(
    @CurrentUser('sub') userId: string,
    @Param('orderId') orderId: string,
    @Req() req: Request,
  ) {
    return this.ordersService.acceptOrder({
      buyerId: userId,
      orderId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':orderId/counter')
  @ApiOperation({ summary: 'Buyer creates a counter offer' })
  async createCounterOffer(
    @CurrentUser('sub') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CounterOfferDto,
  ) {
    return this.ordersService.createCounterOffer({
      buyerId: userId,
      orderId,
      price: dto.price,
      quantity: dto.quantity,
    });
  }

  @Post('counter/:counterOfferId/respond')
  @ApiOperation({ summary: 'Seller accepts or rejects a counter offer' })
  async respondToCounterOffer(
    @CurrentUser('sub') userId: string,
    @Param('counterOfferId') counterOfferId: string,
    @Body() dto: RespondCounterOfferDto,
    @Req() req: Request,
  ) {
    return this.ordersService.respondToCounterOffer({
      sellerId: userId,
      counterOfferId,
      action: dto.action,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('counter/:counterOfferId/counter')
  @ApiOperation({ summary: 'Seller counters a counter offer with a new price' })
  async counterCounterOffer(
    @CurrentUser('sub') userId: string,
    @Param('counterOfferId') counterOfferId: string,
    @Body() dto: CounterCounterOfferDto,
  ) {
    return this.ordersService.counterCounterOffer({
      sellerId: userId,
      counterOfferId,
      price: dto.price,
    });
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: 'Seller cancels an open order' })
  async cancelOrder(
    @CurrentUser('sub') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.cancelOrder(userId, orderId);
  }
}