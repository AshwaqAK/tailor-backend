import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { Role } from '../common/constants/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrderIdParamDto } from '../orders/dto/order-id-param.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentsService } from './payments.service';
import { PaymentIdPipe } from './pipes/payment-id.pipe';

@Controller('payments')
@UseGuards(AccessTokenGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  create(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.create(createPaymentDto, user.userId);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findAll(@Query() query: PaymentQueryDto) {
    return this.paymentsService.findAll(query);
  }

  @Get(':paymentId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findOne(@Param('paymentId', PaymentIdPipe) paymentId: string) {
    return this.paymentsService.findOne(paymentId);
  }

  @Post(':paymentId/refund')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  refund(@Param('paymentId', PaymentIdPipe) paymentId: string, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.refund(paymentId, user.userId);
  }
}

@Controller('orders/:orderId/payments')
@UseGuards(AccessTokenGuard, RolesGuard)
export class OrderPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR)
  findByOrder(@Param() params: OrderIdParamDto, @Query() query: PaymentQueryDto) {
    return this.paymentsService.findByOrder(params.orderId, query);
  }
}
