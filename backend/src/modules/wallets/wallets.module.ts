import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { WalletsController } from './wallets.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule, ConfigModule],
  providers: [WalletService],
  controllers: [WalletsController],
  exports: [WalletService],
})
export class WalletsModule {}