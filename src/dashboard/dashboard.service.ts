import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';

import { AppointmentStatus } from '../appointments/enums/appointment-status.enum';
import { Appointment, AppointmentDocument } from '../appointments/schemas/appointment.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { QuantityUnit } from '../fabrics/enums/quantity-unit.enum';
import { Fabric, FabricDocument } from '../fabrics/schemas/fabric.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import {
  TailoringService,
  TailoringServiceDocument,
} from '../services/schemas/tailoring-service.schema';
import { DashboardSummary } from './types/dashboard-summary.type';
import { parseReportDate, ReportDateQueryDto } from './dto/report-date-query.dto';

interface GroupedCount<T> {
  _id: T;
  count: number;
}

interface OrderDashboardAggregation {
  ordersToday: Array<{ count: number }>;
  statusCounts: GroupedCount<OrderStatus>[];
  orderValue: Array<{ total: number }>;
  outstanding: Array<{ total: number; orderCount: number }>;
  recentOrders: Array<{
    orderId: string;
    customerId: string;
    customerName?: string;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    status: OrderStatus;
    createdAt: Date;
  }>;
  salesMix: Array<SalesMixAggregation>;
}

interface RevenueAggregation {
  total: number;
}

interface FabricQuantityAggregation {
  _id: QuantityUnit;
  total: number;
}

interface SalesMixAggregation {
  tailoringAmount: number;
  attachedFabricAmount: number;
  fabricSaleAmount: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly configService: ConfigService,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,

    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,

    @InjectModel(Fabric.name)
    private readonly fabricModel: Model<FabricDocument>,

    @InjectModel(TailoringService.name)
    private readonly tailoringServiceModel: Model<TailoringServiceDocument>,
  ) {}

  async getSummary(query: ReportDateQueryDto = new ReportDateQueryDto()): Promise<DashboardSummary> {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
    const lowStockThreshold = this.configService.get<number>('app.fabricLowStockThreshold', 5);

    const [
      customerActivityCounts,
      orderDashboard,
      appointmentStatusCounts,
      upcomingAppointments,
      fabricActivityCounts,
      lowStockFabricCount,
      fabricQuantityByUnit,
      tailoringServiceActivityCounts,
      revenue,
    ] = await Promise.all([
      this.customerModel
        .aggregate<GroupedCount<boolean>>([{ $group: { _id: '$isActive', count: { $sum: 1 } } }])
        .exec(),
      this.orderModel.aggregate<OrderDashboardAggregation>([
        {
          $facet: {
            ordersToday: [
              {
                $match: {
                  createdAt: { $gte: startOfToday, $lt: startOfTomorrow },
                },
              },
              { $count: 'count' },
            ],
            statusCounts: [
              ...this.buildDateMatchStages(query),
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
            orderValue: [
              ...this.buildDateMatchStages(query),
              { $group: { _id: null, total: { $sum: '$totalAmount' } } },
            ],
            outstanding: [
              { $match: { status: { $ne: OrderStatus.CANCELLED } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$balanceAmount' },
                  orderCount: { $sum: 1 },
                },
              },
            ],
            recentOrders: [
              { $sort: { createdAt: -1 } },
              { $limit: 5 },
              {
                $lookup: {
                  from: 'customers',
                  localField: 'customerId',
                  foreignField: 'customerId',
                  as: 'customer',
                },
              },
              {
                $project: {
                  _id: 0,
                  orderId: 1,
                  customerId: 1,
                  customerName: { $arrayElemAt: ['$customer.name', 0] },
                  totalAmount: 1,
                  paidAmount: 1,
                  balanceAmount: 1,
                  status: 1,
                  createdAt: 1,
                },
              },
            ],
            salesMix: [
              ...this.buildDateMatchStages(query),
              {
                $lookup: {
                  from: 'orderitems',
                  localField: 'orderId',
                  foreignField: 'orderId',
                  as: 'items',
                },
              },
              { $unwind: '$items' },
              {
                $group: {
                  _id: null,
                  tailoringAmount: {
                    $sum: {
                      $cond: [
                        { $eq: ['$items.itemType', 'FABRIC_SALE'] },
                        0,
                        {
                          $ifNull: [
                            '$items.tailoringPricingSnapshot.finalTailoringTotal',
                            { $multiply: ['$items.unitPrice', '$items.quantity'] },
                          ],
                        },
                      ],
                    },
                  },
                  attachedFabricAmount: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ['$items.itemType', 'FABRIC_SALE'] },
                            { $ne: ['$items.fabricSnapshot', null] },
                          ],
                        },
                        {
                          $multiply: [
                            '$items.fabricSnapshot.pricePerUnit',
                            '$items.fabricSnapshot.quantityUsed',
                          ],
                        },
                        0,
                      ],
                    },
                  },
                  fabricSaleAmount: {
                    $sum: {
                      $cond: [
                        { $eq: ['$items.itemType', 'FABRIC_SALE'] },
                        { $ifNull: ['$items.fabricSaleSnapshot.lineTotal', 0] },
                        0,
                      ],
                    },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  tailoringAmount: { $round: ['$tailoringAmount', 2] },
                  attachedFabricAmount: { $round: ['$attachedFabricAmount', 2] },
                  fabricSaleAmount: { $round: ['$fabricSaleAmount', 2] },
                },
              },
            ],
          },
        },
      ]).exec(),
      this.appointmentModel
        .aggregate<GroupedCount<AppointmentStatus>>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.appointmentModel
        .countDocuments({
          appointmentDate: { $gte: startOfToday },
          status: {
            $in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
          },
        })
        .exec(),
      this.fabricModel
        .aggregate<GroupedCount<boolean>>([{ $group: { _id: '$isActive', count: { $sum: 1 } } }])
        .exec(),
      this.fabricModel
        .countDocuments({
          isActive: true,
          quantity: { $lte: lowStockThreshold },
        })
        .exec(),
      this.fabricModel
        .aggregate<FabricQuantityAggregation>([
          { $match: { isActive: true } },
          { $group: { _id: '$unit', total: { $sum: '$quantity' } } },
        ])
        .exec(),
      this.tailoringServiceModel
        .aggregate<GroupedCount<boolean>>([{ $group: { _id: '$isActive', count: { $sum: 1 } } }])
        .exec(),
      this.paymentModel
        .aggregate<RevenueAggregation>([
          {
            $match: {
              status: PaymentStatus.SUCCESS,
              ...this.buildPaymentDateMatch(query),
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec(),
    ]);

    const customersByActivity = { active: 0, inactive: 0 };
    for (const result of customerActivityCounts) {
      customersByActivity[result._id ? 'active' : 'inactive'] = result.count;
    }

    const ordersByStatus: Record<OrderStatus, number> = {
      [OrderStatus.DRAFT]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.IN_PROGRESS]: 0,
      [OrderStatus.READY]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
    };
    const orderDashboardResult = orderDashboard[0] ?? {
      ordersToday: [],
      statusCounts: [],
      orderValue: [],
      outstanding: [],
      recentOrders: [],
      salesMix: [],
    };
    for (const result of orderDashboardResult.statusCounts) {
      ordersByStatus[result._id] = result.count;
    }

    const appointmentsByStatus: Record<AppointmentStatus, number> = {
      [AppointmentStatus.SCHEDULED]: 0,
      [AppointmentStatus.CONFIRMED]: 0,
      [AppointmentStatus.COMPLETED]: 0,
      [AppointmentStatus.CANCELLED]: 0,
      [AppointmentStatus.NO_SHOW]: 0,
    };
    for (const result of appointmentStatusCounts) {
      appointmentsByStatus[result._id] = result.count;
    }

    const fabricsByActivity = { active: 0, inactive: 0 };
    for (const result of fabricActivityCounts) {
      fabricsByActivity[result._id ? 'active' : 'inactive'] = result.count;
    }

    const tailoringServicesByActivity = { active: 0, inactive: 0 };
    for (const result of tailoringServiceActivityCounts) {
      tailoringServicesByActivity[result._id ? 'active' : 'inactive'] = result.count;
    }

    const availableQuantityByUnit: Record<QuantityUnit, number> = {
      [QuantityUnit.METER]: 0,
      [QuantityUnit.PIECE]: 0,
    };
    for (const result of fabricQuantityByUnit) {
      availableQuantityByUnit[result._id] = result.total;
    }

    const totalCustomers = customersByActivity.active + customersByActivity.inactive;
    const totalOrders = Object.values(ordersByStatus).reduce((total, count) => total + count, 0);
    const totalAppointments = Object.values(appointmentsByStatus).reduce(
      (total, count) => total + count,
      0,
    );

    return {
      totalCustomers,
      activeCustomers: customersByActivity.active,
      totalOrders,
      pendingOrders: ordersByStatus.DRAFT + ordersByStatus.CONFIRMED,
      inProgressOrders: ordersByStatus.IN_PROGRESS + ordersByStatus.READY,
      completedOrders: ordersByStatus.DELIVERED,
      totalAppointments,
      upcomingAppointments,
      totalActiveFabrics: fabricsByActivity.active,
      totalActiveTailoringServices: tailoringServicesByActivity.active,
      ordersByStatus,
      appointmentsByStatus,
      customersByActivity,
      fabricsByActivity,
      tailoringServicesByActivity,
      lowStockFabrics: {
        count: lowStockFabricCount,
        threshold: lowStockThreshold,
      },
      ordersToday: orderDashboardResult.ordersToday[0]?.count ?? 0,
      orderValue: orderDashboardResult.orderValue[0]?.total ?? 0,
      outstanding: {
        total: orderDashboardResult.outstanding[0]?.total ?? 0,
        orderCount: orderDashboardResult.outstanding[0]?.orderCount ?? 0,
      },
      recentOrders: orderDashboardResult.recentOrders,
      revenue: {
        collected: revenue[0]?.total ?? 0,
      },
      fabricStock: {
        activeFabricCount: fabricsByActivity.active,
        inactiveFabricCount: fabricsByActivity.inactive,
        availableQuantityByUnit,
        lowStock: {
          count: lowStockFabricCount,
          threshold: lowStockThreshold,
        },
      },
      salesMix: {
        tailoringAmount: orderDashboardResult.salesMix?.[0]?.tailoringAmount ?? 0,
        attachedFabricAmount: orderDashboardResult.salesMix?.[0]?.attachedFabricAmount ?? 0,
        fabricSaleAmount: orderDashboardResult.salesMix?.[0]?.fabricSaleAmount ?? 0,
        totalOrderValue: orderDashboardResult.orderValue[0]?.total ?? 0,
      },
    };
  }

  private buildDateMatchStages(query: ReportDateQueryDto): PipelineStage.Match[] {
    if (!query.fromDate && !query.toDate) {
      return [];
    }

    const range: { $gte?: Date; $lt?: Date } = {};

    if (query.fromDate) {
      range.$gte = parseReportDate(query.fromDate);
    }

    if (query.toDate) {
      const exclusiveUpperBoundary = parseReportDate(query.toDate);
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(query.toDate);

      if (isDateOnly) {
        exclusiveUpperBoundary.setUTCDate(exclusiveUpperBoundary.getUTCDate() + 1);
      } else {
        exclusiveUpperBoundary.setTime(exclusiveUpperBoundary.getTime() + 1);
      }

      range.$lt = exclusiveUpperBoundary;
    }

    return [{ $match: { createdAt: range } }];
  }

  private buildPaymentDateMatch(query: ReportDateQueryDto): Record<string, unknown> {
    if (!query.fromDate && !query.toDate) {
      return {};
    }

    const range: { $gte?: Date; $lt?: Date } = {};

    if (query.fromDate) {
      range.$gte = parseReportDate(query.fromDate);
    }

    if (query.toDate) {
      const exclusiveUpperBoundary = parseReportDate(query.toDate);
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(query.toDate);

      if (isDateOnly) {
        exclusiveUpperBoundary.setUTCDate(exclusiveUpperBoundary.getUTCDate() + 1);
      } else {
        exclusiveUpperBoundary.setTime(exclusiveUpperBoundary.getTime() + 1);
      }

      range.$lt = exclusiveUpperBoundary;
    }

    return { paidAt: range };
  }
}
