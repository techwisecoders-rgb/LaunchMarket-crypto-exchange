import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TransfersService } from './transfers.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class TransferDto {
  /**
   * Recipient resolved by email OR userId. If both are provided, userId wins.
   */
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Provide a valid email if not using recipientUserId' })
  recipientEmail?: string;

  @IsEnum(['ETHEREUM', 'BASE'])
  chain: 'ETHEREUM' | 'BASE';

  @IsString()
  @IsNotEmpty()
  token: string;

  /**
   * Decimal string, e.g. "0.5" for 0.5 ETH.
   */
  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@ApiTags('transfers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @ApiOperation({
    summary: 'Internal transfer between LaunchMarket users (same chain/token)',
  })
  async createTransfer(
    @CurrentUser('sub') senderId: string,
    @Body() dto: TransferDto,
  ) {
    if (!dto.recipientUserId && !dto.recipientEmail) {
      throw new Error('Either `recipientUserId` or `recipientEmail` must be provided.');
    }
    return this.transfersService.transfer({
      senderId,
      recipientEmail: dto.recipientEmail,
      recipientUserId: dto.recipientUserId,
      chain: dto.chain,
      token: dto.token,
      amount: dto.amount,
      note: dto.note,
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'My transfer history (sent + received)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyTransfers(
    @CurrentUser('sub') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.transfersService.getMyTransfers(
      userId,
      parseInt(page, 10),
      Math.min(parseInt(limit, 10), 100),
    );
  }
}