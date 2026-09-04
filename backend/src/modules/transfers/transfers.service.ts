import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChainType } from '../wallets/wallet.service';

export interface TransferInput {
  senderId: string;
  recipientEmail?: string;
  recipientUserId?: string;
  chain: ChainType;
  token: string;
  amount: string;
  note?: string;
}

export interface TransferResult {
  transferId: string;
  sender: { userId: string; email: string };
  recipient: { userId: string; email: string };
  chain: ChainType;
  token: string;
  amount: string;
  senderBalanceAfter: string;
  recipientBalanceAfter: string;
}

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Internal transfer between two LaunchMarket users on the same chain/token.
   *
   * Atomicity: sender debit + recipient credit happen in a single Prisma
   * $transaction with row-level locking on both Balance rows to prevent a
   * concurrent transfer / order / withdrawal from double-spending the
   * sender's available balance.
   *
   * Anti-spam: a user cannot send to themselves, and both users must be
   * ACTIVE.
   */
  async transfer(input: TransferInput): Promise<TransferResult> {
    const { senderId, recipientEmail, recipientUserId, chain, token, amount, note } = input;
    const tokenUpper = token.toUpperCase();

    // 1) Validate input
    if (!recipientEmail && !recipientUserId) {
      throw new BadRequestException('Either `recipientEmail` or `recipientUserId` must be provided.');
    }
    const supportedTokens = ['ETH', 'USDT', 'USDC'];
    if (!supportedTokens.includes(tokenUpper)) {
      throw new BadRequestException(`Token "${token}" is not supported for internal transfers.`);
    }
    const amountDec = new Prisma.Decimal(amount);
    if (amountDec.isNaN() || amountDec.lte(0)) {
      throw new BadRequestException('Amount must be a positive number.');
    }

    // 2) Resolve recipient
    let recipient: { id: string; email: string; status: string } | null = null;
    if (recipientUserId) {
      recipient = await this.prisma.user.findUnique({
        where: { id: recipientUserId },
        select: { id: true, email: true, status: true },
      });
    } else if (recipientEmail) {
      recipient = await this.prisma.user.findUnique({
        where: { email: recipientEmail.toLowerCase().trim() },
        select: { id: true, email: true, status: true },
      });
    }
    if (!recipient) throw new NotFoundException('Recipient not found.');
    if (recipient.id === senderId) {
      throw new BadRequestException('You cannot transfer funds to yourself.');
    }
    if (recipient.status !== 'ACTIVE') {
      throw new ForbiddenException(`Recipient account is ${recipient.status}. Transfers are disabled.`);
    }

    // 3) Verify sender
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, email: true, status: true },
    });
    if (!sender) throw new NotFoundException('Sender not found.');
    if (sender.status !== 'ACTIVE') {
      throw new ForbiddenException(`Your account is ${sender.status}. Transfers are disabled.`);
    }

    // 4) Wallets on the requested chain
    const [senderWallet, recipientWallet] = await Promise.all([
      this.prisma.wallet.findFirst({ where: { userId: senderId, chain, walletType: 'SPOT' } }),
      this.prisma.wallet.findFirst({ where: { userId: recipient.id, chain, walletType: 'SPOT' } }),
    ]);
    if (!senderWallet) throw new NotFoundException(`You don't have a SPOT wallet on ${chain}.`);
    if (!recipientWallet) {
      throw new NotFoundException(`Recipient doesn't have a SPOT wallet on ${chain}. They need to log in once to provision it.`);
    }

    // 5) Atomic transfer with row-level locking on both balances.
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock both Balance rows in deterministic order (sorted userId) to
      // avoid deadlocks when two users transfer to each other concurrently.
      const sortedUsers = [senderId, recipient.id].sort();
      const lockOrder =
        sortedUsers[0] === senderId
          ? [
              { userId: senderId, chain, token: tokenUpper },
              { userId: recipient.id, chain, token: tokenUpper },
            ]
          : [
              { userId: recipient.id, chain, token: tokenUpper },
              { userId: senderId, chain, token: tokenUpper },
            ];

      for (const key of lockOrder) {
        await tx.$queryRaw`
          SELECT id FROM "Balance"
          WHERE "userId" = ${key.userId}
            AND chain = ${key.chain}
            AND token = ${key.token}
          FOR UPDATE
        `;
      }

      let senderBalance = await tx.balance.findFirst({
        where: { walletId: senderWallet.id, chain, token: tokenUpper },
      });
      if (!senderBalance) {
        senderBalance = await tx.balance.create({
          data: {
            walletId: senderWallet.id,
            userId: senderId,
            chain,
            token: tokenUpper,
            available: 0,
            locked: 0,
            total: 0,
          },
        });
      }
      let recipientBalance = await tx.balance.findFirst({
        where: { walletId: recipientWallet.id, chain, token: tokenUpper },
      });
      if (!recipientBalance) {
        recipientBalance = await tx.balance.create({
          data: {
            walletId: recipientWallet.id,
            userId: recipient.id,
            chain,
            token: tokenUpper,
            available: 0,
            locked: 0,
            total: 0,
          },
        });
      }

      if (new Prisma.Decimal(senderBalance.available).lt(amountDec)) {
        throw new BadRequestException(
          `Insufficient available balance. You have ${senderBalance.available} ${tokenUpper}, need ${amountDec.toString()} ${tokenUpper}.`,
        );
      }

      const newSenderAvailable = new Prisma.Decimal(senderBalance.available).sub(amountDec);
      const newSenderTotal = new Prisma.Decimal(senderBalance.total).sub(amountDec);
      const newRecipientAvailable = new Prisma.Decimal(recipientBalance.available).add(amountDec);
      const newRecipientTotal = new Prisma.Decimal(recipientBalance.total).add(amountDec);

      await tx.balance.update({
        where: { id: senderBalance.id },
        data: { available: newSenderAvailable, total: newSenderTotal },
      });
      await tx.balance.update({
        where: { id: recipientBalance.id },
        data: { available: newRecipientAvailable, total: newRecipientTotal },
      });

      const transfer = await tx.transfer.create({
        data: {
          senderId,
          recipientId: recipient.id,
          chain,
          token: tokenUpper,
          amount: amountDec,
          note: note ?? null,
          status: 'COMPLETED',
          senderBalanceAfter: newSenderAvailable,
          recipientBalanceAfter: newRecipientAvailable,
        },
      });
await tx.walletTransaction.create({
        data: {
          userId: senderId,
          walletId: senderWallet.id,
          chain,
          token: tokenUpper,
          type: 'INTERNAL_TRANSFER',
          status: 'COMPLETED',
          amount: amountDec,
          fee: new Prisma.Decimal(0),
          netAmount: amountDec,
          balanceAfter: newSenderAvailable,
          referenceId: transfer.id,
          counterpartyUserId: recipient.id,
          description: `Transfer of ${amountDec.toString()} ${tokenUpper} to ${recipient.email}`,
        },
      });
      await tx.walletTransaction.create({
        data: {
          userId: recipient.id,
          walletId: recipientWallet.id,
          chain,
          token: tokenUpper,
          type: 'INTERNAL_TRANSFER',
          status: 'COMPLETED',
          amount: amountDec,
          fee: new Prisma.Decimal(0),
          netAmount: amountDec,
          balanceAfter: newRecipientAvailable,
          referenceId: transfer.id,
          counterpartyUserId: senderId,
          description: `Transfer of ${amountDec.toString()} ${tokenUpper} from ${sender.email}`,
        },
      });

      await tx.notification.create({
        data: {
          userId: senderId,
          type: 'TRANSFER',
          title: 'Transfer sent',
          message: `You sent ${amountDec.toString()} ${tokenUpper} to ${recipient.email}.`,
          channel: 'BOTH',
        },
      });
      await tx.notification.create({
        data: {
          userId: recipient.id,
          type: 'TRANSFER',
          title: 'Transfer received',
          message: `You received ${amountDec.toString()} ${tokenUpper} from ${sender.email}.`,
          channel: 'BOTH',
        },
      });
      await tx.auditLog.create({
        data: {
          userId: senderId,
          action: 'INTERNAL_TRANSFER_SENT',
          entity: 'Transfer',
          entityId: transfer.id,
          details: {
            recipientId: recipient.id,
            recipientEmail: recipient.email,
            chain,
            token: tokenUpper,
            amount: amountDec.toString(),
            note: note ?? null,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: recipient.id,
          action: 'INTERNAL_TRANSFER_RECEIVED',
          entity: 'Transfer',
          entityId: transfer.id,
          details: {
            senderId,
            senderEmail: sender.email,
            chain,
            token: tokenUpper,
            amount: amountDec.toString(),
          },
        },
      });

      return { transfer, newSenderAvailable, newRecipientAvailable };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.logger.log(
      `[TRANSFER] ${sender.email} -> ${recipient.email}: ${amountDec.toString()} ${tokenUpper} on ${chain} (transferId=${result.transfer.id})`,
    );

    this.realtimeGateway.emitToUser(senderId, 'balance:update', {
      userId: senderId,
      chain,
      token: tokenUpper,
      amount: amountDec.toString(),
      direction: 'out',
      transferId: result.transfer.id,
      at: new Date().toISOString(),
    });
    this.realtimeGateway.emitToUser(recipient.id, 'balance:update', {
      userId: recipient.id,
      chain,
      token: tokenUpper,
      amount: amountDec.toString(),
      direction: 'in',
      transferId: result.transfer.id,
      at: new Date().toISOString(),
    });
    this.realtimeGateway.emitToUser(senderId, 'transfer:sent', result.transfer);
    this.realtimeGateway.emitToUser(recipient.id, 'transfer:received', result.transfer);

    return {
      transferId: result.transfer.id,
      sender: { userId: sender.id, email: sender.email },
      recipient: { userId: recipient.id, email: recipient.email },
      chain,
      token: tokenUpper,
      amount: amountDec.toString(),
      senderBalanceAfter: result.newSenderAvailable.toString(),
      recipientBalanceAfter: result.newRecipientAvailable.toString(),
    };
  }

  /**
   * Paginated transfer history for the current user (both sent + received).
   */
  async getMyTransfers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.TransferWhereInput = {
      OR: [{ senderId: userId }, { recipientId: userId }],
    };
    const [data, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        include: {
          sender: { select: { id: true, email: true } },
          recipient: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transfer.count({ where }),
    ]);
    return {
      data: data.map((t) => ({
        ...t,
        direction: t.senderId === userId ? 'OUT' : 'IN',
        counterparty:
          t.senderId === userId ? t.recipient.email : t.sender.email,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}