import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

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
  @Matches(/^SRV-\d{6}$/, {
    message: 'serviceId must be a valid tailoring service ID',
  })
  serviceId?: string;

  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.fabricId !== undefined || item.fabricQuantity !== undefined,
  )
  @IsString()
  @Matches(/^FAB-\d{6}$/, {
    message: 'fabricId must be a valid fabric ID',
  })
  fabricId?: string;

  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.fabricId !== undefined || item.fabricQuantity !== undefined,
  )
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  fabricQuantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
