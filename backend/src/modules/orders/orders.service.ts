import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService, ChainType } from '../wallets/wallet.service';
import { FeesService } from '../fees/fees.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly feesService: FeesService,
  ) {}

  /**
   * Seller creates a sell order on the marketplace.
   */
  async createSellOrder(params: {
    userId: string;
    chain: ChainType;
    token: string;
    quoteToken?: string;
    quantity: string;
    price: string;
    expiresInHours?: number;
  }) {
    const {
      userId,
      chain,
      token,
      quoteToken = 'USDT',
      quantity,
      price,
      expiresInHours = 24,
    } = params;

    const tokenUpper = token.toUpperCase();
    const quoteUpper = (quoteToken || 'USDT').toUpperCase();
    const quantityDec = new Prisma.Decimal(quantity);
    const priceDec = new Prisma.Decimal(price);

    // Validations
    if (quantityDec.lte(0) || priceDec.lte(0)) {
      throw new BadRequestException('Quantity and price must be greater than zero');
    }
    if (Number.isNaN(quantityDec.toNumber()) || Number.isNaN(priceDec.toNumber())) {
      throw new BadRequestException('Quantity and price must be valid numbers');
    }

    // Supported tokens
    const supportedTokens = ['ETH', 'USDT', 'USDC'];
    if (!supportedTokens.includes(tokenUpper)) {
      throw new BadRequestException('Token not supported for trading');
    }

    // Check user status
    const user = await this.prisma.user.findUnique({
      where: { id: userId, status: 'ACTIVE' },
    });
    if (!user) {
      throw new BadRequestException('Account is not active');
    }

    // Check available balance in the seller's wallet
    const wallet = await this.walletService.getUserWallet(userId, chain);
    const balance = await this.prisma.balance.findUnique({
      where: {
        walletId_token: {
          walletId: wallet.id,
          token: tokenUpper,
        },
      },
    });

    if (!balance || Number(balance.available) < Number(quantityDec)) {
      throw new BadRequestException('Insufficient available balance');
    }

    // Compute service fee for trading
    const feeInfo = await this.feesService.getFee({
      type: 'TRADING',
      chain,
      token: tokenUpper,
    });
    const feePercent = new Prisma.Decimal(feeInfo.percentage);

    // Lock the token quantity in an atomic transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Row-lock the balance
      await tx.$queryRaw`
        SELECT id FROM "Balance" WHERE id = ${balance.id} FOR UPDATE
      `;

      const current = await tx.balance.findUnique({ where: { id: balance.id } });
      if (!current || Number(current.available) < Number(quantityDec)) {
        throw new BadRequestException('Insufficient available balance');
      }

      // Move from available to locked
      await tx.balance.update({
        where: { id: current.id },
        data: {
          available: current.available.sub(quantityDec),
          locked: current.locked.add(quantityDec),
        },
      });

      // Create the order
      const created = await tx.order.create({
        data: {
          sellerId: userId,
          chain,
          token: tokenUpper,
          quantity: quantityDec,
          price: priceDec,
          quoteToken: quoteUpper,
          type: 'SELL',
          status: 'OPEN',
          expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
        },
      });

      // Order history
      await tx.orderHistory.create({
        data: {
          orderId: created.id,
          action: 'CREATE',
          actorId: userId,
          details: { chain, token: tokenUpper, quantity: quantityDec.toString(), price: priceDec.toString() },
        },
      });

      // Wallet transaction record
      await tx.walletTransaction.create({
        data: {
          userId,
          walletId: wallet.id,
          chain,
          token: tokenUpper,
          type: 'ORDER_CREATE',
          status: 'PENDING',
          amount: quantityDec,
          fee: new Prisma.Decimal(0),
          netAmount: quantityDec,
          balanceAfter: current.available.sub(quantityDec),
          referenceId: created.id,
          description: `Locked ${quantityDec.toString()} ${tokenUpper} for sell order ${created.id}`,
        },
      });

      return created;
    });

    this.logger.log(`Sell order created: ${order.id} by ${userId} for ${quantity} ${tokenUpper}`);

    return {
      orderId: order.id,
      status: order.status,
      token: order.token,
      quantity: order.quantity.toString(),
      price: order.price.toString(),
      totalValue: order.quantity.mul(order.price).toString(),
      expiresAt: order.expiresAt,
    };
  }

  /**
   * List marketplace orders with filters and pagination.
   *
   * Filters:
   *   - symbol      "ETH/USDT" or "ETH/USDT-BASE" — pairs base/quote tokens.
   *                 Sends the correct baseToken/quoteToken/chain filter.
   *   - baseToken   Single-token filter (raw token, e.g. "ETH").
   *   - chain       "ETHEREUM" or "BASE".
   *   - status      Defaults to "OPEN".
   *   - excludeUserId  Hide the caller's own orders.
   */
  async listMarketplaceOrders(params: {
    page?: number;
    limit?: number;
    token?: string;
    baseToken?: string;
    quoteToken?: string;
    symbol?: string;
    chain?: string;
    status?: string;
    excludeUserId?: string;
  }) {
    const {
      page = 1,
      limit = 20,
      token,
      baseToken,
      quoteToken,
      symbol,
      chain,
      status = 'OPEN',
      excludeUserId,
    } = params;

    const where: Prisma.OrderWhereInput = {
      // Defensive: never show junk orders that have no price or no quantity.
      AND: [
        { quantity: { gt: new Prisma.Decimal(0) } },
        { price: { gt: new Prisma.Decimal(0) } },
      ],
    };

    // Parse "ETH/USDT" or "ETH/USDT-BASE" symbols.
    let parsedBase: string | undefined;
    let parsedQuote: string | undefined;
    let parsedChain: string | undefined;
    if (symbol && symbol.includes('/')) {
      const [base, rest] = symbol.split('/');
      parsedBase = base?.toUpperCase();
      // Symbol can be "ETH/USDT" or "ETH/USDT-BASE"
      if (rest) {
        const dashIdx = rest.indexOf('-');
        if (dashIdx >= 0) {
          parsedQuote = rest.slice(0, dashIdx).toUpperCase();
          parsedChain = rest.slice(dashIdx + 1).toUpperCase();
        } else {
          parsedQuote = rest.toUpperCase();
        }
      }
    }

    if (token) where.token = token.toUpperCase();
    if (baseToken) where.token = baseToken.toUpperCase();
    if (parsedBase) where.token = parsedBase;
    if (quoteToken || parsedQuote) {
      where.quoteToken = (quoteToken ?? parsedQuote ?? '').toUpperCase();
    }
    if (chain || parsedChain) {
      where.chain = (chain ?? parsedChain ?? '').toUpperCase();
    }
    if (status) where.status = status;
    if (excludeUserId) {
      where.sellerId = { not: excludeUserId };
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get a single order with its counter offers.
   */
  async getOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        seller: {
          select: { id: true, email: true, fullName: true },
        },
        buyer: {
          select: { id: true, email: true, fullName: true },
        },
        counterOffers: {
          include: {
            fromUser: {
              select: { id: true, email: true, fullName: true },
            },
            toUser: {
              select: { id: true, email: true, fullName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        trades: {
          orderBy: { createdAt: 'desc' },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /**
   * Get the current user's orders.
   *
   * Returns orders where the user is:
   *   - the seller (sellerId), OR
   *   - the buyer (buyerId, set after a trade is executed), OR
   *   - a buyer on a related Trade row (covers legacy data created before
   *     `Order.buyerId` was populated on accept).
   *
   * Always filters out junk rows (zero quantity / zero price) so the UI
   * is never polluted with empty placeholder orders.
   */
  async getUserOrders(userId: string, status?: string, page = 1, limit = 20) {
    const baseFilter: Prisma.OrderWhereInput = {
      OR: [
        { sellerId: userId },
        { buyerId: userId },
        { trades: { some: { buyerId: userId } } },
      ],
      AND: [
        { quantity: { gt: new Prisma.Decimal(0) } },
        { price: { gt: new Prisma.Decimal(0) } },
      ],
    };
    const where: Prisma.OrderWhereInput = status
      ? { AND: [baseFilter, { status }] }
      : baseFilter;

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          counterOffers: {
            where: { status: 'PENDING' },
            select: { id: true, price: true, quantity: true, fromUserId: true, createdAt: true },
          },
          trades: {
            select: { id: true, quantity: true, price: true, buyerId: true, status: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Buyer accepts the seller's price. Executes the trade automatically.
   */
  async acceptOrder(params: {
    buyerId: string;
    orderId: string;
    ip?: string;
    userAgent?: string;
  }) {
    const { buyerId, orderId, ip, userAgent } = params;

    return this.prisma.$transaction(async (tx) => {
      // Lock the order row
      await tx.$queryRaw`
        SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
      `;

      const order = await tx.order.findUnique({ where: { id: orderId } });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.sellerId === buyerId) {
        throw new BadRequestException('You cannot accept your own order');
      }

      if (order.status !== 'OPEN') {
        throw new BadRequestException(`Order is not open (status: ${order.status})`);
      }

      if (order.expiresAt && order.expiresAt < new Date()) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'EXPIRED' },
        });
        throw new BadRequestException('Order has expired');
      }

      // Check buyer status
      const buyer = await tx.user.findUnique({
        where: { id: buyerId, status: 'ACTIVE' },
      });
      if (!buyer) {
        throw new BadRequestException('Account is not active');
      }

      // Check buyer has the quote token balance
      const buyerWallet = await this.walletService.getUserWallet(buyerId, order.chain as ChainType);
      const quoteToken = order.quoteToken;
      const totalCost = order.quantity.mul(order.price);

      const buyerBalance = await tx.balance.findUnique({
        where: {
          walletId_token: {
            walletId: buyerWallet.id,
            token: quoteToken,
          },
        },
      });

      if (!buyerBalance || Number(buyerBalance.available) < Number(totalCost)) {
        throw new BadRequestException(
          `Insufficient ${quoteToken} balance to accept this order`,
        );
      }

      // Execute the trade (this also stamps order.buyerId so the buyer
      // can see the order in their "my orders" listing).
      const trade = await this.executeTrade(
        tx,
        {
          orderId: order.id,
          sellerId: order.sellerId,
          buyerId,
          chain: order.chain as ChainType,
          token: order.token,
          quantity: order.quantity,
          price: order.price,
          quoteToken: order.quoteToken,
          feePercentage: new Prisma.Decimal('0.1'),
        },
        ip,
        userAgent,
      );

      return trade;
    });
  }

  /**
   * Buyer creates a counter offer on an order.
   */
  async createCounterOffer(params: {
    buyerId: string;
    orderId: string;
    price: string;
    quantity?: string;
  }) {
    const { buyerId, orderId, price, quantity } = params;

    const priceDec = new Prisma.Decimal(price);
    if (priceDec.lte(0)) {
      throw new BadRequestException('Counter offer price must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock the order row
      await tx.$queryRaw`
        SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
      `;

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.sellerId === buyerId) {
        throw new BadRequestException('You cannot make a counter offer on your own order');
      }

      if (!['OPEN', 'PENDING'].includes(order.status)) {
        throw new BadRequestException(`Order is not open (status: ${order.status})`);
      }

      if (order.expiresAt && order.expiresAt < new Date()) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'EXPIRED' },
        });
        throw new BadRequestException('Order has expired');
      }

      // Validate that the counter quantity does not exceed the order quantity
      const counterQuantity = quantity ? new Prisma.Decimal(quantity) : order.quantity;
      if (counterQuantity.gt(order.quantity)) {
        throw new BadRequestException('Counter offer quantity cannot exceed order quantity');
      }

      // Validate against order price: buyer counters at or below asking price
      if (priceDec.gte(order.price)) {
        throw new BadRequestException(
          'Price is not below the asking price. Accept the order instead.',
        );
      }

      // Check for existing pending counter offer from the same buyer
      const existingPending = await tx.counterOffer.findFirst({
        where: {
          orderId: order.id,
          fromUserId: buyerId,
          status: 'PENDING',
        },
      });

      if (existingPending) {
        throw new BadRequestException('You already have a pending counter offer on this order');
      }

      // Buyer must have enough quote token for the counter offer value
      const buyerWallet = await this.walletService.getUserWallet(buyerId, order.chain as ChainType);
      const quoteToken = order.quoteToken;
      const counterTotal = counterQuantity.mul(priceDec);

      const buyerBalance = await tx.balance.findUnique({
        where: {
          walletId_token: {
            walletId: buyerWallet.id,
            token: quoteToken,
          },
        },
      });

      if (!buyerBalance || Number(buyerBalance.available) < Number(counterTotal)) {
        throw new BadRequestException(
          `Insufficient ${quoteToken} balance for counter offer`,
        );
      }

      // Reserve buyer's funds for the counter offer
      await tx.$queryRaw`
        SELECT id FROM "Balance" WHERE id = ${buyerBalance.id} FOR UPDATE
      `;

      const currentBuyerBalance = await tx.balance.findUnique({
        where: { id: buyerBalance.id },
      });

      if (!currentBuyerBalance || Number(currentBuyerBalance.available) < Number(counterTotal)) {
        throw new BadRequestException('Insufficient balance');
      }

      await tx.balance.update({
        where: { id: currentBuyerBalance.id },
        data: {
          available: currentBuyerBalance.available.sub(counterTotal),
          locked: currentBuyerBalance.locked.add(counterTotal),
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: buyerId,
          walletId: buyerWallet.id,
          chain: order.chain,
          token: quoteToken,
          type: 'COUNTER_LOCK',
          status: 'PENDING',
          amount: counterTotal,
          fee: new Prisma.Decimal(0),
          netAmount: counterTotal,
          balanceAfter: currentBuyerBalance.available.sub(counterTotal),
          referenceId: order.id,
          description: `Locked ${counterTotal.toString()} ${quoteToken} for counter offer on order ${order.id}`,
        },
      });

      // Update order status to PENDING (has active counter offer)
      if (order.status === 'OPEN') {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PENDING' },
        });
      }

      // Create the counter offer
      const counterOffer = await tx.counterOffer.create({
        data: {
          orderId: order.id,
          fromUserId: buyerId,
          toUserId: order.sellerId,
          price: priceDec,
          quantity: counterQuantity,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Order history
      await tx.orderHistory.create({
        data: {
          orderId: order.id,
          action: 'COUNTER_OFFER',
          actorId: buyerId,
          details: { counterOfferId: counterOffer.id, price: priceDec.toString(), quantity: counterQuantity.toString() },
        },
      });

      // Notification to seller
      await tx.notification.create({
        data: {
          userId: order.sellerId,
          type: 'COUNTER_OFFER',
          title: 'New counter offer',
          message: `You received a counter offer of ${counterQuantity.toString()} ${order.token} at ${priceDec.toString()} per unit on order ${order.id}`,
          channel: 'BOTH',
        },
      });

      return {
        counterOfferId: counterOffer.id,
        status: counterOffer.status,
        price: priceDec.toString(),
        quantity: counterQuantity.toString(),
        total: counterTotal.toString(),
      };
    });
  }

  /**
   * Seller responds to a counter offer: accept or reject.
   */
  async respondToCounterOffer(params: {
    sellerId: string;
    counterOfferId: string;
    action: 'ACCEPT' | 'REJECT';
    ip?: string;
    userAgent?: string;
  }) {
    const { sellerId, counterOfferId, action, ip, userAgent } = params;

    return this.prisma.$transaction(async (tx) => {
      // Lock the counter offer
      await tx.$queryRaw`
        SELECT id FROM "CounterOffer" WHERE id = ${counterOfferId} FOR UPDATE
      `;

      const counterOffer = await tx.counterOffer.findUnique({
        where: { id: counterOfferId },
        include: { order: true },
      });

      if (!counterOffer) {
        throw new NotFoundException('Counter offer not found');
      }

      // Ensure the responding user is the seller (toUser)
      if (counterOffer.toUserId !== sellerId) {
        throw new BadRequestException('Only the seller can respond to this counter offer');
      }

      if (counterOffer.status !== 'PENDING') {
        throw new BadRequestException(`Counter offer is not pending (status: ${counterOffer.status})`);
      }

      const order = counterOffer.order;

      // Handle REJECT
      if (action === 'REJECT') {
        await tx.counterOffer.update({
          where: { id: counterOffer.id },
          data: { status: 'REJECTED', respondedAt: new Date() },
        });

        // Release buyer's locked quote funds
        await this.releaseCounterOfferFunds(tx, counterOffer, order, 'COUNTER_REJECTED');

        // Check if any other pending counter offers exist; if not, set order to OPEN
        const pendingCount = await tx.counterOffer.count({
          where: { orderId: order.id, status: 'PENDING' },
        });
        if (pendingCount === 0 && order.status === 'PENDING') {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'OPEN' },
          });
        }

        await tx.orderHistory.create({
          data: {
            orderId: order.id,
            action: 'REJECT',
            actorId: sellerId,
            details: { counterOfferId: counterOffer.id },
          },
        });

        await tx.notification.create({
          data: {
            userId: counterOffer.fromUserId,
            type: 'COUNTER_REJECTED',
            title: 'Counter offer rejected',
            message: `Your counter offer on order ${order.id} was rejected by the seller`,
            channel: 'BOTH',
          },
        });

        return { counterOfferId: counterOffer.id, status: 'REJECTED' };
      }

      // Handle ACCEPT: execute trade at the counter offer price
      if (action === 'ACCEPT') {
        const buyerId = counterOffer.fromUserId;

        // Buyer status check
        const buyer = await tx.user.findUnique({
          where: { id: buyerId, status: 'ACTIVE' },
        });
        if (!buyer) {
          throw new BadRequestException('Buyer account is not active');
        }

        // Seller status check
        const seller = await tx.user.findUnique({
          where: { id: sellerId, status: 'ACTIVE' },
        });
        if (!seller) {
          throw new BadRequestException('Seller account is not active');
        }

        if (order.expiresAt && order.expiresAt < new Date()) {
          throw new BadRequestException('Order has expired');
        }

        // Re-validate buyer funds are still locked
        const buyerWallet = await this.walletService.getUserWallet(buyerId, order.chain as ChainType);
        const quoteToken = order.quoteToken;
        const tradeTotal = counterOffer.quantity.mul(counterOffer.price);

        const buyerBalance = await tx.balance.findUnique({
          where: {
            walletId_token: {
              walletId: buyerWallet.id,
              token: quoteToken,
            },
          },
        });

        if (!buyerBalance || Number(buyerBalance.locked) < Number(tradeTotal)) {
          throw new BadRequestException('Buyer funds are no longer available');
        }

        // Mark counter offer as accepted
        await tx.counterOffer.update({
          where: { id: counterOffer.id },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
        });

        await tx.orderHistory.create({
          data: {
            orderId: order.id,
            action: 'ACCEPT',
            actorId: sellerId,
            details: { counterOfferId: counterOffer.id, price: counterOffer.price.toString(), quantity: counterOffer.quantity.toString() },
          },
        });

        // Execute the trade at the counter offer price
        const trade = await this.executeTrade(
          tx,
          {
            orderId: order.id,
            sellerId: order.sellerId,
            buyerId,
            chain: order.chain as ChainType,
            token: order.token,
            quantity: counterOffer.quantity,
            price: counterOffer.price,
            quoteToken: order.quoteToken,
            feePercentage: new Prisma.Decimal('0.1'),
          },
          ip,
          userAgent,
        );

        return {
          counterOfferId: counterOffer.id,
          status: 'ACCEPTED',
          trade,
        };
      }

      throw new BadRequestException('Invalid action');
    });
  }

  /**
   * Seller counters a counter offer with a new price.
   */
  async counterCounterOffer(params: {
    sellerId: string;
    counterOfferId: string;
    price: string;
  }) {
    const { sellerId, counterOfferId, price } = params;
    const priceDec = new Prisma.Decimal(price);

    if (priceDec.lte(0)) {
      throw new BadRequestException('Price must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "CounterOffer" WHERE id = ${counterOfferId} FOR UPDATE
      `;

      const counterOffer = await tx.counterOffer.findUnique({
        where: { id: counterOfferId },
        include: { order: true },
      });

      if (!counterOffer) {
        throw new NotFoundException('Counter offer not found');
      }

      if (counterOffer.toUserId !== sellerId) {
        throw new BadRequestException('Only the seller can respond to this counter offer');
      }

      if (counterOffer.status !== 'PENDING') {
        throw new BadRequestException('Counter offer is not pending');
      }

      const order = counterOffer.order;

      // Seller counters at or above the existing counter offer price
      if (priceDec.lte(counterOffer.price)) {
        throw new BadRequestException(
          'New counter price must be higher than the buyer\'s counter offer',
        );
      }

      // Validate against order original price
      if (priceDec.gte(order.price)) {
        throw new BadRequestException(
          'Counter price must be below the original asking price',
        );
      }

      // Reject current counter offer, create a new one with the seller's price
      await tx.counterOffer.update({
        where: { id: counterOffer.id },
        data: { status: 'COUNTERED', respondedAt: new Date() },
      });

      // Release buyer's funds, then re-lock based on new price
      await this.releaseCounterOfferFunds(tx, counterOffer, order, 'COUNTER_COUNTERED');

      // Buyer's new locked amount at the new total
      const buyerWallet = await this.walletService.getUserWallet(counterOffer.fromUserId, order.chain as ChainType);
      const quoteToken = order.quoteToken;
      const newTotal = counterOffer.quantity.mul(priceDec);

      const buyerBalance = await tx.balance.findUnique({
        where: {
          walletId_token: {
            walletId: buyerWallet.id,
            token: quoteToken,
          },
        },
      });

      if (!buyerBalance || Number(buyerBalance.available) < Number(newTotal)) {
        throw new BadRequestException('Buyer has insufficient balance for the new counter price');
      }

      await tx.$queryRaw`
        SELECT id FROM "Balance" WHERE id = ${buyerBalance.id} FOR UPDATE
      `;

      const current = await tx.balance.findUnique({ where: { id: buyerBalance.id } });
      if (!current || Number(current.available) < Number(newTotal)) {
        throw new BadRequestException('Insufficient balance');
      }

      await tx.balance.update({
        where: { id: current.id },
        data: {
          available: current.available.sub(newTotal),
          locked: current.locked.add(newTotal),
        },
      });

      const newCounterOffer = await tx.counterOffer.create({
        data: {
          orderId: order.id,
          fromUserId: counterOffer.fromUserId,
          toUserId: counterOffer.toUserId,
          price: priceDec,
          quantity: counterOffer.quantity,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await tx.orderHistory.create({
        data: {
          orderId: order.id,
          action: 'COUNTER_OFFER',
          actorId: sellerId,
          details: { counterOfferId: newCounterOffer.id, price: priceDec.toString(), quantity: newCounterOffer.quantity.toString() },
        },
      });

      // Notification to buyer
      await tx.notification.create({
        data: {
          userId: counterOffer.fromUserId,
          type: 'NEW_COUNTER',
          title: 'New counter offer from seller',
          message: `Seller countered your offer on order ${order.id} at ${priceDec.toString()} per unit`,
          channel: 'BOTH',
        },
      });

      return {
        counterOfferId: newCounterOffer.id,
        status: 'PENDING',
        price: priceDec.toString(),
        quantity: newCounterOffer.quantity.toString(),
        total: newTotal.toString(),
      };
    });
  }

  /**
   * Cancel an open order (seller only).
   */
  async cancelOrder(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.sellerId !== userId) {
        throw new BadRequestException('Only the seller can cancel this order');
      }

      if (!['OPEN', 'PENDING'].includes(order.status)) {
        throw new BadRequestException(`Order cannot be cancelled (status: ${order.status})`);
      }

      // Release seller's locked token
      const wallet = await this.walletService.getUserWallet(userId, order.chain as ChainType);
      const balance = await tx.balance.findUnique({
        where: {
          walletId_token: {
            walletId: wallet.id,
            token: order.token,
          },
        },
      });

      if (balance) {
        await tx.$queryRaw`
          SELECT id FROM "Balance" WHERE id = ${balance.id} FOR UPDATE
        `;

        const current = await tx.balance.findUnique({ where: { id: balance.id } });
        if (current) {
          await tx.balance.update({
            where: { id: current.id },
            data: {
              available: current.available.add(order.quantity),
              locked: current.locked.sub(order.quantity),
            },
          });

          await tx.walletTransaction.create({
            data: {
              userId,
              walletId: wallet.id,
              chain: order.chain,
              token: order.token,
              type: 'ORDER_CANCEL',
              status: 'COMPLETED',
              amount: order.quantity,
              fee: new Prisma.Decimal(0),
              netAmount: order.quantity,
              balanceAfter: current.available.add(order.quantity),
              referenceId: order.id,
              description: `Refunded locked ${order.quantity.toString()} ${order.token} from cancelled order ${order.id}`,
            },
          });
        }
      }

      // Release all pending counter offers' buyer funds
      const pendingOffers = await tx.counterOffer.findMany({
        where: { orderId: order.id, status: 'PENDING' },
      });

      for (const offer of pendingOffers) {
        await this.releaseCounterOfferFunds(tx, offer, order, 'ORDER_CANCELLED');
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: userId },
      });

      await tx.orderHistory.create({
        data: {
          orderId: order.id,
          action: 'CANCEL',
          actorId: userId,
          details: { reason: 'USER_CANCELLED' },
        },
      });

      return { orderId: order.id, status: 'CANCELLED' };
    });
  }

  /**
   * Expire stale orders.
   */
  async expireStaleOrders() {
    const now = new Date();

    const staleOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['OPEN', 'PENDING'] },
        expiresAt: { lt: now },
      },
    });

    let expired = 0;
    for (const order of staleOrders) {
      try {
        await this.cancelOrder(order.sellerId, order.id);
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: 'EXPIRED' },
        });
        await this.prisma.orderHistory.create({
          data: {
            orderId: order.id,
            action: 'EXPIRE',
            actorId: order.sellerId,
            details: { reason: 'TIME_EXPIRED' },
          },
        });
        expired++;
        this.logger.log(`Order ${order.id} expired`);
      } catch (error) {
        this.logger.error(
          `Failed to expire order ${order.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { expired };
  }

  /**
   * Core trade executor. Must be called within a transaction.
   * Transfers token from seller to buyer and quote token from buyer to seller.
   */
  private async executeTrade(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      sellerId: string;
      buyerId: string;
      chain: ChainType;
      token: string;
      quantity: Prisma.Decimal;
      price: Prisma.Decimal;
      quoteToken: string;
      feePercentage: Prisma.Decimal;
    },
    ip?: string,
    userAgent?: string,
  ) {
    const { orderId, sellerId, buyerId, chain, token, quantity, price, quoteToken, feePercentage } = params;

    const tradeTotal = quantity.mul(price);

    // Seller fee (in token)
    const sellerFee = quantity.mul(feePercentage).div(100);
    const sellerNetToken = quantity.sub(sellerFee);

    // Buyer fee (in quote token)
    const buyerFee = tradeTotal.mul(feePercentage).div(100);
    const buyerNetQuote = tradeTotal.sub(buyerFee);

    // Get wallets
    const sellerWallet = await this.walletService.getUserWallet(sellerId, chain);
    const buyerWallet = await this.walletService.getUserWallet(buyerId, chain);

    // Fetch balances (locked within transaction)
    const sellerTokenBalance = await tx.balance.findUnique({
      where: {
        walletId_token: { walletId: sellerWallet.id, token },
      },
    });
    const buyerQuoteBalance = await tx.balance.findUnique({
      where: {
        walletId_token: { walletId: buyerWallet.id, token: quoteToken },
      },
    });

    if (!sellerTokenBalance || Number(sellerTokenBalance.locked) < Number(quantity)) {
      throw new BadRequestException('Seller has insufficient locked token');
    }
    if (!buyerQuoteBalance || Number(buyerQuoteBalance.locked) < Number(tradeTotal)) {
      throw new BadRequestException('Buyer has insufficient locked quote token');
    }

    // Row locks
    await tx.$queryRaw`SELECT id FROM "Balance" WHERE id = ${sellerTokenBalance.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Balance" WHERE id = ${buyerQuoteBalance.id} FOR UPDATE`;

    // Get or create buyer token balance (receives token)
    let buyerTokenBalance = await tx.balance.findUnique({
      where: {
        walletId_token: { walletId: buyerWallet.id, token },
      },
    });
    if (!buyerTokenBalance) {
      buyerTokenBalance = await tx.balance.create({
        data: {
          walletId: buyerWallet.id,
          userId: buyerId,
          chain,
          token,
          available: new Prisma.Decimal(0),
          locked: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
        },
      });
    } else {
      await tx.$queryRaw`SELECT id FROM "Balance" WHERE id = ${buyerTokenBalance.id} FOR UPDATE`;
    }

    // Get or create seller quote balance (receives quote)
    let sellerQuoteBalance = await tx.balance.findUnique({
      where: {
        walletId_token: { walletId: sellerWallet.id, token: quoteToken },
      },
    });
    if (!sellerQuoteBalance) {
      sellerQuoteBalance = await tx.balance.create({
        data: {
          walletId: sellerWallet.id,
          userId: sellerId,
          chain,
          token: quoteToken,
          available: new Prisma.Decimal(0),
          locked: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
        },
      });
    } else {
      await tx.$queryRaw`SELECT id FROM "Balance" WHERE id = ${sellerQuoteBalance.id} FOR UPDATE`;
    }

    // 1. Move token from seller locked to buyer available (net of seller fee)
    const newSellerTokenLocked = sellerTokenBalance.locked.sub(quantity);
    const newBuyerTokenAvailable = buyerTokenBalance.available.add(sellerNetToken);

    await tx.balance.update({
      where: { id: sellerTokenBalance.id },
      data: { locked: newSellerTokenLocked },
    });

    await tx.balance.update({
      where: { id: buyerTokenBalance.id },
      data: {
        available: newBuyerTokenAvailable,
        total: buyerTokenBalance.total.add(sellerNetToken),
      },
    });

    // 2. Move quote from buyer locked to seller available (net of buyer fee)
    const newBuyerQuoteLocked = buyerQuoteBalance.locked.sub(tradeTotal);
    const newSellerQuoteAvailable = sellerQuoteBalance.available.add(buyerNetQuote);

    await tx.balance.update({
      where: { id: buyerQuoteBalance.id },
      data: { locked: newBuyerQuoteLocked },
    });

    await tx.balance.update({
      where: { id: sellerQuoteBalance.id },
      data: {
        available: newSellerQuoteAvailable,
        total: sellerQuoteBalance.total.add(buyerNetQuote),
      },
    });

    // 3. Determine order status: if fully matched, complete; else keep pending/open
    const remaining = await this.computeRemainingOrderQuantity(tx, orderId);
    const currentOrder = await tx.order.findUnique({ where: { id: orderId } });
    const orderStatus = remaining.lte(0)
      ? 'COMPLETED'
      : currentOrder?.status ?? 'OPEN';

    // Always record who took the order so the buyer can see it in their
    // "my orders" listing, even for partial fills.
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: orderStatus,
        buyerId,
      },
    });

    // 4. Create the trade record
    const trade = await tx.trade.create({
      data: {
        orderId,
        sellerId,
        buyerId,
        chain,
        token,
        quantity,
        price,
        total: tradeTotal,
        sellerFee,
        buyerFee,
        status: 'EXECUTED',
        executedAt: new Date(),
      },
    });

    // 5. Record fee income as wallet transactions (exchange revenue tracking)
    // Seller fee in token
    await tx.walletTransaction.create({
      data: {
        userId: sellerId,
        walletId: sellerWallet.id,
        chain,
        token,
        type: 'FEE',
        status: 'COMPLETED',
        amount: sellerFee,
        fee: new Prisma.Decimal(0),
        netAmount: sellerFee,
        balanceAfter: newSellerTokenLocked,
        referenceId: trade.id,
        description: `Trading fee (seller) for trade ${trade.id}: ${sellerFee.toString()} ${token}`,
      },
    });

    // Buyer fee in quote token
    await tx.walletTransaction.create({
      data: {
        userId: buyerId,
        walletId: buyerWallet.id,
        chain,
        token: quoteToken,
        type: 'FEE',
        status: 'COMPLETED',
        amount: buyerFee,
        fee: new Prisma.Decimal(0),
        netAmount: buyerFee,
        balanceAfter: newBuyerQuoteLocked,
        referenceId: trade.id,
        description: `Trading fee (buyer) for trade ${trade.id}: ${buyerFee.toString()} ${quoteToken}`,
      },
    });

    // 6. Wallet transactions for the four fund movements
    await tx.walletTransaction.create({
      data: {
        userId: sellerId,
        walletId: sellerWallet.id,
        chain,
        token,
        type: 'TRADE_MATCH',
        status: 'COMPLETED',
        amount: quantity,
        fee: sellerFee,
        netAmount: sellerNetToken,
        balanceAfter: newSellerTokenLocked,
        referenceId: trade.id,
        description: `Sold ${quantity.toString()} ${token} on order ${orderId}`,
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: buyerId,
        walletId: buyerWallet.id,
        chain,
        token,
        type: 'TRADE_MATCH',
        status: 'COMPLETED',
        amount: sellerNetToken,
        fee: new Prisma.Decimal(0),
        netAmount: sellerNetToken,
        balanceAfter: newBuyerTokenAvailable,
        referenceId: trade.id,
        description: `Received ${sellerNetToken.toString()} ${token} from trade ${trade.id}`,
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: buyerId,
        walletId: buyerWallet.id,
        chain,
        token: quoteToken,
        type: 'TRADE_MATCH',
        status: 'COMPLETED',
        amount: tradeTotal,
        fee: buyerFee,
        netAmount: buyerNetQuote,
        balanceAfter: newBuyerQuoteLocked,
        referenceId: trade.id,
        description: `Paid ${tradeTotal.toString()} ${quoteToken} for ${quantity.toString()} ${token}`,
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: sellerId,
        walletId: sellerWallet.id,
        chain,
        token: quoteToken,
        type: 'TRADE_MATCH',
        status: 'COMPLETED',
        amount: buyerNetQuote,
        fee: new Prisma.Decimal(0),
        netAmount: buyerNetQuote,
        balanceAfter: newSellerQuoteAvailable,
        referenceId: trade.id,
        description: `Received ${buyerNetQuote.toString()} ${quoteToken} from trade ${trade.id}`,
      },
    });

    // 7. Order history
    await tx.orderHistory.create({
      data: {
        orderId,
        action: 'EXECUTE',
        actorId: sellerId,
        details: {
          tradeId: trade.id,
          buyerId,
          quantity: quantity.toString(),
          price: price.toString(),
          total: tradeTotal.toString(),
        },
      },
    });

    // 8. Notifications
    await tx.notification.create({
      data: {
        userId: sellerId,
        type: 'TRADE',
        title: 'Trade completed',
        message: `Your order ${orderId} was matched. You sold ${quantity.toString()} ${token} for ${buyerNetQuote.toString()} ${quoteToken} (after fees)`,
        channel: 'BOTH',
      },
    });

    await tx.notification.create({
      data: {
        userId: buyerId,
        type: 'TRADE',
        title: 'Trade completed',
        message: `You bought ${sellerNetToken.toString()} ${token} for ${tradeTotal.toString()} ${quoteToken} (incl. fee ${buyerFee.toString()})`,
        channel: 'BOTH',
      },
    });

    // 9. Audit log
    await tx.auditLog.create({
      data: {
        userId: sellerId,
        action: 'TRADE_COMPLETED',
        entity: 'Trade',
        entityId: trade.id,
        details: {
          orderId,
          buyerId,
          chain,
          token,
          quantity: quantity.toString(),
          price: price.toString(),
          total: tradeTotal.toString(),
          sellerFee: sellerFee.toString(),
          buyerFee: buyerFee.toString(),
        },
        ipAddress: ip,
        userAgent,
      },
    });

    return {
      tradeId: trade.id,
      status: 'EXECUTED',
      token,
      quoteToken,
      quantity: quantity.toString(),
      price: price.toString(),
      total: tradeTotal.toString(),
      sellerFee: sellerFee.toString(),
      buyerFee: buyerFee.toString(),
    };
  }

  /**
   * Release locked buyer funds when a counter offer is rejected/cancelled.
   */
  private async releaseCounterOfferFunds(
    tx: Prisma.TransactionClient,
    counterOffer: { fromUserId: string; quantity: Prisma.Decimal; price: Prisma.Decimal },
    order: { chain: string; token: string; quoteToken: string },
    description: string,
  ) {
    const buyerWallet = await this.walletService.getUserWallet(
      counterOffer.fromUserId,
      order.chain as ChainType,
    );
    const quoteToken = order.quoteToken;
    const lockedTotal = counterOffer.quantity.mul(counterOffer.price);

    const balance = await tx.balance.findUnique({
      where: {
        walletId_token: {
          walletId: buyerWallet.id,
          token: quoteToken,
        },
      },
    });

    if (balance && Number(balance.locked) >= Number(lockedTotal)) {
      await tx.$queryRaw`SELECT id FROM "Balance" WHERE id = ${balance.id} FOR UPDATE`;

      const current = await tx.balance.findUnique({ where: { id: balance.id } });
      if (current && Number(current.locked) >= Number(lockedTotal)) {
        await tx.balance.update({
          where: { id: current.id },
          data: {
            available: current.available.add(lockedTotal),
            locked: current.locked.sub(lockedTotal),
          },
        });

        await tx.walletTransaction.create({
          data: {
            userId: counterOffer.fromUserId,
            walletId: buyerWallet.id,
            chain: order.chain,
            token: quoteToken,
            type: 'COUNTER_RELEASE',
            status: 'COMPLETED',
            amount: lockedTotal,
            fee: new Prisma.Decimal(0),
            netAmount: lockedTotal,
            balanceAfter: current.available.add(lockedTotal),
            description: `${description} — released ${lockedTotal.toString()} ${quoteToken}`,
          },
        });
      }
    }
  }

  /**
   * Compute the remaining unmatched quantity for an order.
   */
  private async computeRemainingOrderQuantity(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<Prisma.Decimal> {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return new Prisma.Decimal(0);

    const aggregate = await tx.trade.aggregate({
      where: { orderId, status: 'EXECUTED' },
      _sum: { quantity: true },
    });

    const traded = aggregate._sum.quantity ?? new Prisma.Decimal(0);
    return order.quantity.sub(traded);
  }
}