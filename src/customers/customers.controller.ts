import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@Controller('customers')
@UseGuards(AccessTokenGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  create(@Body() createCustomerDto: CreateCustomerDto, @CurrentUser() user: JwtPayload) {
    return this.customersService.createCustomer(createCustomerDto, user.userId);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findAll(@Query() query: CustomerQueryDto) {
    return this.customersService.searchCustomers(query);
  }

  @Get('by-customer-id/:customerId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findByCustomerId(@Param('customerId') customerId: string) {
    return this.customersService.findCustomerByCustomerId(customerId);
  }

  @Get('search/phone/:phone')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findByPhone(@Param('phone') phone: string) {
    return this.customersService.findCustomerByPhone(phone);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findOne(@Param('id') id: string) {
    return this.customersService.findCustomerById(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.updateCustomer(id, updateCustomerDto, user.userId);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.customersService.deactivateCustomer(id, user.userId);
  }
}
