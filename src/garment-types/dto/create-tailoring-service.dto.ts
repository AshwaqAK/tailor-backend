import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateTailoringServiceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'serviceId must not be empty' })
  @MaxLength(100)
  serviceId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;
}
