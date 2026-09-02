import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Executes an operation within a transaction with retry logic for
   * deadlock/race condition resilience.
   */
  async runInTransaction<T>(
    operation: (tx: PrismaClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await this.$transaction(async (tx) => {
          return await operation(tx as PrismaClient);
        });
      } catch (error: unknown) {
        attempt++;
        const isRetryable = this.isRetryableError(error);
        if (attempt >= maxRetries || !isRetryable) {
          throw error;
        }
        this.logger.warn(
          `Transaction retry ${attempt}/${maxRetries} due to: ${(error as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      }
    }
    throw new Error('Transaction failed after retries');
  }

  private isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('deadlock') ||
      message.includes('could not serialize') ||
      message.includes('P2034') ||
      message.includes('write conflict')
    );
  }
}