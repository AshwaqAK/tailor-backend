import { PartialType } from '@nestjs/mapped-types';

import { CreateGarmentTypeDto } from './create-garment-type.dto';

export class UpdateGarmentTypeDto extends PartialType(CreateGarmentTypeDto) {}
