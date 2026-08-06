import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // En producción se leen los orígenes permitidos desde la variable de entorno
  // ALLOWED_ORIGINS (lista separada por comas), con fallback a localhost para
  // desarrollo local. Ejemplo Railway:
  // ALLOWED_ORIGINS=https://leads.elavellano.cl,https://www.elavellano.cl
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Valida y transforma automáticamente los DTOs (query params, body, etc.)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta propiedades no declaradas en el DTO
      transform: true, // convierte los query params (strings) a los tipos del DTO
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Leads Global API')
    .setDescription(
      'API para captar y administrar leads de Facebook/Instagram Lead Ads',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
  console.log(`📘 Documentación Swagger en http://localhost:${port}/docs`);
}
bootstrap();
