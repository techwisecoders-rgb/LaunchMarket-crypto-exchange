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
import crypto from 'crypto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ---------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------

  const apiPrefix = configService.get<string>('API_PREFIX', 'api');
  const apiVersion = configService.get<string>('API_VERSION', 'v1');

  // Render provides PORT automatically.
  // Keep 3001 as the local-development fallback.
  const port = configService.get<number>('PORT', 3001);

  // Production frontend URL:
  // https://launchmarket-crypto-exchange-1.onrender.com
  //
  // You can also set multiple origins in Render:
  //
  // CORS_ORIGINS=https://launchmarket-crypto-exchange-1.onrender.com,http://localhost:3000
  //
  const configuredCorsOrigins = configService.get<string>(
    'CORS_ORIGINS',
    '',
  );

  const defaultCorsOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://launchmarket-crypto-exchange-1.onrender.com',
  ];

  const corsOrigins = (
    configuredCorsOrigins
      ? configuredCorsOrigins.split(',')
      : defaultCorsOrigins
  )
    .map((origin) => origin.trim())
    .filter(Boolean);

  logger.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);

  // ---------------------------------------------------------
  // Security middleware
  // ---------------------------------------------------------

  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
      contentSecurityPolicy: false,
    }),
  );

  // ---------------------------------------------------------
  // Cookie parser
  // ---------------------------------------------------------

  app.use(cookieParser());

  // ---------------------------------------------------------
  // CORS
  // ---------------------------------------------------------

  app.enableCors({
    origin: (origin, callback) => {
      // Requests without an Origin header can occur from:
      // - Postman
      // - server-to-server requests
      // - health checks
      // - some non-browser clients
      if (!origin) {
        return callback(null, true);
      }

      if (corsOrigins.includes(origin)) {
        logger.debug(`CORS allowed: ${origin}`);
        return callback(null, true);
      }

      logger.warn(`CORS blocked: ${origin}`);

      return callback(new Error('Not allowed by CORS'), false);
    },

    credentials: true,

    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-CSRF-Token',
      'X-Requested-With',
    ],

    exposedHeaders: [
      'X-CSRF-Token',
    ],
  });

  // ---------------------------------------------------------
  // Global API prefix
  // ---------------------------------------------------------

  app.setGlobalPrefix(`${apiPrefix}/${apiVersion}`);

  // ---------------------------------------------------------
  // Global validation
  // ---------------------------------------------------------

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ---------------------------------------------------------
  // Global exception filter
  // ---------------------------------------------------------

  app.useGlobalFilters(new AllExceptionsFilter());

  // ---------------------------------------------------------
  // Global response interceptor
  // ---------------------------------------------------------

  app.useGlobalInterceptors(new TransformInterceptor());

  // ---------------------------------------------------------
  // CSRF protection
  // Double-submit cookie pattern
  // ---------------------------------------------------------

  app.use(
    (req: Request, res: Response, next: NextFunction) => {
      const csrfToken = req.cookies?.['csrf_token'];

      if (!csrfToken) {
        res.cookie(
          'csrf_token',
          crypto.randomBytes(32).toString('hex'),
          {
            httpOnly: false,

            secure: configService.get<boolean>(
              'COOKIE_SECURE',
              true,
            ),

            sameSite: configService.get(
              'COOKIE_SAME_SITE',
              'none',
            ) as 'lax' | 'strict' | 'none',

            path: '/',
          },
        );
      }

      next();
    },
  );

  // ---------------------------------------------------------
  // Swagger
  // ---------------------------------------------------------

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LAUNCHMARKET CRYPTO EXCHANGE API')
    .setDescription(
      'Production-grade hybrid cryptocurrency exchange API',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        in: 'header',
      },
      'access-token',
    )
    .addCookieAuth('refresh_token', {
      type: 'http',
      scheme: 'bearer',
    })
    .setContact(
      'LaunchMarket Crypto Exchange',
      'https://launchmarket.exchange',
      'support@launchmarket.exchange',
    )
    .build();

  const document = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );

  SwaggerModule.setup(
    `${apiPrefix}/docs`,
    app,
    document,
    {
      swaggerOptions: {
        persistAuthorization: true,
      },
    },
  );

  // ---------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------

  app.enableShutdownHooks();

  // ---------------------------------------------------------
  // Start server
  // ---------------------------------------------------------

  await app.listen(port);

  logger.log(
    `LAUNCHMARKET CRYPTO EXCHANGE API running on http://localhost:${port}/${apiPrefix}/${apiVersion}`,
  );

  logger.log(
    `Swagger docs available at http://localhost:${port}/${apiPrefix}/docs`,
  );
}

void bootstrap();