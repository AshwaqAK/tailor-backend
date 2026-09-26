import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { Role } from '../common/constants/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AppointmentQueryDto } from './dto/appointment-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.appointmentsService.create(createAppointmentDto, user.userId);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findAll(@Query() query: AppointmentQueryDto) {
    return this.appointmentsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  update(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.appointmentsService.update(id, updateAppointmentDto, user.userId);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}
