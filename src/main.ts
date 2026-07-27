import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // para que React (otro puerto/dominio) pueda llamar a la API

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
