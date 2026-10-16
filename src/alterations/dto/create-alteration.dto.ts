import { Type } from 'class-transformer';
import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAlterationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^CUS-\d{6}$/, { message: 'customerId must be a valid customer ID' })
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^ORD-\d{6}$/, { message: 'originalOrderId must be a valid order ID' })
  originalOrderId!: string;

  @IsMongoId()
  originalOrderItemId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'description must not be empty' })
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  charge?: number;
}
