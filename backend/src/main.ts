import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const apiPrefix = configService.get<string>('API_PREFIX', 'api');
  const apiVersion = configService.get<string>('API_VERSION', 'v1');
  const port = configService.get<number>('PORT', 3001);
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'https://launchmarket-crypto-exchange-1.onrender.com')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Security middleware
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  // Cookie parser
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
    exposedHeaders: ['X-CSRF-Token'],
  });

  // Global prefix
  app.setGlobalPrefix(`${apiPrefix}/${apiVersion}`);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // CSRF protection (double-submit cookie pattern)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const csrfToken = req.cookies?.['csrf_token'];
    if (!csrfToken) {
      res.cookie('csrf_token', require('crypto').randomBytes(32).toString('hex'), {
        httpOnly: false,
        secure: configService.get<boolean>('COOKIE_SECURE', false),
        sameSite: configService.get('COOKIE_SAME_SITE', 'lax') as 'lax' | 'strict' | 'none',
        path: '/',
      });
    }
    next();
  });

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('LAUNCHMARKET CRYPTO EXCHANGE API')
    .setDescription('Production-grade hybrid cryptocurrency exchange API')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'JWT', in: 'header' },
      'access-token',
    )
    .addCookieAuth('refresh_token', { type: 'http', scheme: 'bearer' })
    .setContact('LaunchMarket Crypto Exchange', 'https://launchmarket.exchange', 'support@launchmarket.exchange')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`LAUNCHMARKET CRYPTO EXCHANGE API running on http://localhost:${port}/${apiPrefix}/${apiVersion}`);
  logger.log(`Swagger docs available at http://localhost:${port}/${apiPrefix}/docs`);
}

void bootstrap();