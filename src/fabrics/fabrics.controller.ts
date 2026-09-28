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
import { CreateFabricDto } from './dto/create-fabric.dto';
import { FabricQueryDto } from './dto/fabric-query.dto';
import { UpdateFabricDto } from './dto/update-fabric.dto';
import { FabricsService } from './fabrics.service';

@Controller('fabrics')
@UseGuards(AccessTokenGuard, RolesGuard)
export class FabricsController {
  constructor(private readonly fabricsService: FabricsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  create(@Body() createFabricDto: CreateFabricDto, @CurrentUser() user: JwtPayload) {
    return this.fabricsService.create(createFabricDto, user.userId);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findAll(@Query() query: FabricQueryDto) {
    return this.fabricsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findOne(@Param('id') id: string) {
    return this.fabricsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() updateFabricDto: UpdateFabricDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fabricsService.update(id, updateFabricDto, user.userId);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.fabricsService.remove(id);
  }
}
