import { IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

import { ClothingType } from '../../measurements/enums/clothing-type.enum';

export class CreateOrderItemDto {
  @IsEnum(ClothingType)
  clothingType!: ClothingType;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsMongoId()
  measurementId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
