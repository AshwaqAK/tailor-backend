import {
  IsEnum,
  IsObject,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf,
} from 'class-validator';

import { ClothingType } from '../../measurements/enums/clothing-type.enum';

export enum OrderItemType {
  TAILORING = 'TAILORING',
  FABRIC_SALE = 'FABRIC_SALE',
}

@ValidatorConstraint({ name: 'tailoringOnlyField', async: false })
class TailoringOnlyFieldConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return (args.object as CreateOrderItemDto).itemType !== OrderItemType.FABRIC_SALE;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} is not allowed for FABRIC_SALE items`;
  }
}

@ValidatorConstraint({ name: 'orderItemQuantity', async: false })
class OrderItemQuantityConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
      return false;
    }

    const item = args.object as CreateOrderItemDto;
    return item.itemType === OrderItemType.FABRIC_SALE || Number.isInteger(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const item = args.object as CreateOrderItemDto;

    return item.itemType === OrderItemType.FABRIC_SALE
      ? `${args.property} must be a positive number`
      : `${args.property} must be a positive integer`;
  }
}

export class CreateOrderItemDto {
  @IsOptional()
  @IsEnum(OrderItemType)
  itemType?: OrderItemType;

  constructor() {
    this.itemType = OrderItemType.TAILORING;
  }

  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.itemType !== OrderItemType.FABRIC_SALE || item.garmentTypeId !== undefined,
  )
  @Validate(TailoringOnlyFieldConstraint)
  @IsString()
  @Matches(/^GRT-\d{6}$/, {
    message: 'garmentTypeId must be a valid garment type ID',
  })
  garmentTypeId!: string;

  @IsOptional()
  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.itemType !== OrderItemType.FABRIC_SALE || item.clothingType !== undefined,
  )
  @Validate(TailoringOnlyFieldConstraint)
  @IsEnum(ClothingType)
  clothingType?: ClothingType;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  @Validate(OrderItemQuantityConstraint)
  quantity!: number;

  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.itemType !== OrderItemType.FABRIC_SALE || item.unitPrice !== undefined,
  )
  @Validate(TailoringOnlyFieldConstraint)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.itemType !== OrderItemType.FABRIC_SALE || item.customizations !== undefined,
  )
  @Validate(TailoringOnlyFieldConstraint)
  @IsObject()
  customizations?: Record<string, unknown>;

  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.itemType !== OrderItemType.FABRIC_SALE || item.measurementId !== undefined,
  )
  @Validate(TailoringOnlyFieldConstraint)
  @IsMongoId()
  measurementId?: string;

  @IsOptional()
  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.itemType !== OrderItemType.FABRIC_SALE || item.serviceId !== undefined,
  )
  @Validate(TailoringOnlyFieldConstraint)
  @IsString()
  @Matches(/^SRV-\d{6}$/, {
    message: 'serviceId must be a valid tailoring service ID',
  })
  serviceId?: string;

  @ValidateIf(
    (item: CreateOrderItemDto) =>
      item.itemType === OrderItemType.FABRIC_SALE ||
      item.fabricId !== undefined ||
      item.fabricQuantity !== undefined,
  )
  @IsString()
  @Matches(/^FAB-\d{6}$/, {
    message: 'fabricId must be a valid fabric ID',
  })
  fabricId?: string;

  @ValidateIf(
    (item: CreateOrderItemDto) =>
      (item.itemType !== OrderItemType.FABRIC_SALE &&
        (item.fabricId !== undefined || item.fabricQuantity !== undefined)) ||
      (item.itemType === OrderItemType.FABRIC_SALE && item.fabricQuantity !== undefined),
  )
  @Validate(TailoringOnlyFieldConstraint)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  fabricQuantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
