import { IsString, Matches } from 'class-validator';

export class OrderIdParamDto {
  @IsString()
  @Matches(/^ORD-?\d+$/, {
    message: 'orderId must be a valid human-readable order ID',
  })
  orderId!: string;
}
