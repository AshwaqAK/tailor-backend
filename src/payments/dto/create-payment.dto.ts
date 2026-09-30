import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaymentMethod } from '../enums/payment-method.enum';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^ORD-\d{6}$/, {
    message: 'orderId must be a valid order ID',
  })
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'transactionId must not be empty' })
  @MaxLength(200)
  transactionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
