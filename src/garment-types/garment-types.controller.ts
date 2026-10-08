import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { Role } from '../common/constants/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateGarmentTypeDto } from './dto/create-garment-type.dto';
import { UpdateGarmentTypeDto } from './dto/update-garment-type.dto';
import { GarmentTypesService } from './garment-types.service';

@Controller('garment-types')
@UseGuards(AccessTokenGuard, RolesGuard)
export class GarmentTypesController {
  constructor(private readonly garmentTypesService: GarmentTypesService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  create(@Body() createGarmentTypeDto: CreateGarmentTypeDto, @CurrentUser() user: JwtPayload) {
    return this.garmentTypesService.create(createGarmentTypeDto, user.userId);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findAll() {
    return this.garmentTypesService.findAll();
  }

  @Get(':garmentTypeId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findOne(@Param('garmentTypeId') garmentTypeId: string) {
    return this.garmentTypesService.findOne(garmentTypeId);
  }

  @Patch(':garmentTypeId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  update(
    @Param('garmentTypeId') garmentTypeId: string,
    @Body() updateGarmentTypeDto: UpdateGarmentTypeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.garmentTypesService.update(garmentTypeId, updateGarmentTypeDto, user.userId);
  }
}
