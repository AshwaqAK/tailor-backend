import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { Role } from '../common/constants/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomerIdParamDto } from './dto/customer-id-param.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderIdParamDto } from './dto/order-id-param.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AccessTokenGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  create(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.ordersService.createOrder(createOrderDto, user.userId);
  }

  @Get('customer/:customerId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findByCustomer(@Param() params: CustomerIdParamDto) {
    return this.ordersService.getOrdersByCustomerId(params.customerId);
  }

  @Get(':orderId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findOne(@Param() params: OrderIdParamDto) {
    return this.ordersService.getOrderByOrderId(params.orderId);
  }

  @Patch(':orderId/status')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  updateStatus(
    @Param() params: OrderIdParamDto,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.updateOrderStatus(
      params.orderId,
      updateOrderStatusDto.status,
      user.userId,
    );
  }
}
