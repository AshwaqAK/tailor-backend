import { Body, Controller, Get, Param, ParseEnumPipe, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/constants/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { ClothingType } from './enums/clothing-type.enum';
import { MeasurementsService } from './measurements.service';

@Controller('measurements')
@UseGuards(AccessTokenGuard, RolesGuard)
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  create(@Body() createMeasurementDto: CreateMeasurementDto, @CurrentUser() user: JwtPayload) {
    return this.measurementsService.createMeasurement(createMeasurementDto, user.userId);
  }

  @Get(':customerId/:clothingType/latest')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findLatest(
    @Param('customerId') customerId: string,
    @Param('clothingType', new ParseEnumPipe(ClothingType)) clothingType: ClothingType,
  ) {
    return this.measurementsService.getLatestMeasurement(customerId, clothingType);
  }

  @Get(':customerId/:clothingType/history')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findHistory(
    @Param('customerId') customerId: string,
    @Param('clothingType', new ParseEnumPipe(ClothingType)) clothingType: ClothingType,
  ) {
    return this.measurementsService.getMeasurementHistory(customerId, clothingType);
  }

  @Get('customer/:customerId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findByCustomer(@Param('customerId') customerId: string) {
    return this.measurementsService.getMeasurementsByCustomer(customerId);
  }
}
