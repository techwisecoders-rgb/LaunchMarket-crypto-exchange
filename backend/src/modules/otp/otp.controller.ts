import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OtpService } from './otp.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('otp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @ApiOperation({ summary: 'Request an OTP code sent to email' })
  async requestOtp(
    @CurrentUser('sub') userId: string,
    @CurrentUser('email') email: string,
    @Body() body: { purpose: string },
    @Req() req: Request,
  ) {
    const purposes = ['WITHDRAWAL', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'LOGIN'];
    if (!purposes.includes(body.purpose)) {
      return { error: 'Invalid purpose' };
    }
    return this.otpService.generateAndSendOtp(userId, body.purpose, email, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify an OTP code' })
  async verifyOtp(
    @CurrentUser('sub') userId: string,
    @Body() body: { purpose: string; code: string },
  ) {
    return this.otpService.verifyOtp(userId, body.purpose, body.code);
  }
}