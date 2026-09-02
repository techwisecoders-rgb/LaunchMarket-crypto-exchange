import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DepositsService } from './deposits.service';
import { DepositsController } from './deposits.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { WalletsModule } from '../wallets/wallets.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, BlockchainModule, WalletsModule, RealtimeModule, ConfigModule],
  controllers: [DepositsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}