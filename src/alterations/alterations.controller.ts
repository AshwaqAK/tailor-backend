import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { Role } from '../common/constants/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AlterationQueryDto } from './dto/alteration-query.dto';
import { CreateAlterationDto } from './dto/create-alteration.dto';
import { UpdateAlterationDto } from './dto/update-alteration.dto';
import { AlterationsService } from './alterations.service';
import { AlterationIdPipe } from './pipes/alteration-id.pipe';

@Controller('alterations')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AlterationsController {
  constructor(private readonly alterationsService: AlterationsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  create(@Body() dto: CreateAlterationDto, @CurrentUser() user: JwtPayload) {
    return this.alterationsService.create(dto, user.userId);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findAll(@Query() query: AlterationQueryDto) {
    return this.alterationsService.findAll(query);
  }

  @Get(':alterationId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findOne(@Param('alterationId', AlterationIdPipe) alterationId: string) {
    return this.alterationsService.findOne(alterationId);
  }

  @Patch(':alterationId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  update(
    @Param('alterationId', AlterationIdPipe) alterationId: string,
    @Body() dto: UpdateAlterationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.alterationsService.update(alterationId, dto, user.userId);
  }

  @Post(':alterationId/bill')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  createBill(
    @Param('alterationId', AlterationIdPipe) alterationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.alterationsService.createBill(alterationId, user.userId);
  }
}
