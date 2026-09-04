import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WithdrawalsService } from './withdrawals.service';
import { WithdrawalsController } from './withdrawals.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { WalletsModule } from '../wallets/wallets.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { FeesModule } from '../fees/fees.module';
import { OtpModule } from '../otp/otp.module';
import { MailerModule } from '../mailer/mailer.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    WalletsModule,
    BlockchainModule,
    FeesModule,
    OtpModule,
    MailerModule,
    RealtimeModule,
    ConfigModule,
  ],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}