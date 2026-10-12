import { PickType } from '@nestjs/mapped-types';

import { CreateOrderItemDto } from './create-order-item.dto';

export class PricingPreviewDto extends PickType(CreateOrderItemDto, [
  'garmentTypeId',
  'quantity',
  'customizations',
] as const) {}
