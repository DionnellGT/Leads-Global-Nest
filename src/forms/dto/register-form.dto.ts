import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RegisterFormDto {
  @ApiProperty({
    description: 'ID del formulario en Meta (Biblioteca de formularios de Lead Ads)',
    example: '1364247358453695',
  })
  @IsString()
  @MinLength(1)
  formId: string;

  @ApiProperty({
    description: 'ID de la página de Facebook a la que pertenece el formulario',
    example: '2252250168381472',
  })
  @IsString()
  @MinLength(1)
  pageId: string;
}
