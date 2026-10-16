import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';

import { AppointmentStatus } from '../appointments/enums/appointment-status.enum';
import { AppointmentType } from '../appointments/enums/appointment-type.enum';
import { Appointment, AppointmentDocument } from '../appointments/schemas/appointment.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { QuantityUnit } from '../fabrics/enums/quantity-unit.enum';
import { Fabric, FabricDocument } from '../fabrics/schemas/fabric.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { OrderType } from '../orders/enums/order-type.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { ServiceCategory } from '../services/enums/service-category.enum';
import {
  TailoringService,
  TailoringServiceDocument,
} from '../services/schemas/tailoring-service.schema';
import {
  CustomerReportQueryDto,
  FabricSalesReportQueryDto,
  OrderReportQueryDto,
  parseReportDate,
  PaymentReportQueryDto,
  ReportDateQueryDto,
  ServiceUsageReportQueryDto,
} from './dto/report-date-query.dto';
import {
  AppointmentReport,
  CustomerReport,
  FabricReport,
  FabricSalesReport,
  OrderReport,
  PaymentReport,
  ServiceReport,
  ServiceUsageReport,
} from './types/reports.type';

interface GroupedCount<T> {
  _id: T;
  count: number;
}

interface AppointmentReportAggregation {
  byStatus: GroupedCount<AppointmentStatus>[];
  byType: GroupedCount<AppointmentType>[];
}

interface FabricReportAggregation {
  activity: GroupedCount<boolean>[];
  lowStock: Array<{ count: number }>;
  availableQuantityByUnit: Array<{ _id: QuantityUnit; total: number }>;
}

interface ServiceReportAggregation {
  activity: GroupedCount<boolean>[];
  byCategory: GroupedCount<ServiceCategory>[];
}

type OrderComposition = 'TAILORING_ONLY' | 'FABRIC_SALE_ONLY' | 'MIXED';

interface OrderReportAggregation {
  statusCounts: GroupedCount<OrderStatus>[];
  financial: Array<{
    orderCount: number;
    orderValue: number;
    paidAmount: number;
    outstandingBalance: number;
  }>;
  classificationFinancial: Array<{
    _id: OrderType;
    orderCount: number;
    orderValue: number;
    paidAmount: number;
    outstandingBalance: number;
  }>;
  composition: Array<{
    _id: OrderComposition;
    orderCount: number;
    tailoringAmount: number;
    attachedFabricAmount: number;
    fabricSaleAmount: number;
  }>;
}

interface PaymentReportAggregation {
  grossCollections: Array<{ total: number }>;
  refunds: Array<{ total: number }>;
  byStatus: GroupedCount<PaymentStatus>[];
  byMethod: GroupedCount<PaymentMethod>[];
  byOrderTypeCollections: Array<{ _id: OrderType; total: number }>;
  byOrderTypeRefunds: Array<{ _id: OrderType; total: number }>;
}

interface CustomerReportAggregation {
  activity: GroupedCount<boolean>[];
  commercialSummary: Array<{
    customerOrderCount: number;
    repeatCustomerCount: number;
    orderValue: number;
    currentPaidAmount: number;
    currentOutstandingBalance: number;
    standardOrderCount: number;
    alterationBillCount: number;
    standardOrderValue: number;
    alterationBillValue: number;
    standardPaidAmount: number;
    alterationBillPaidAmount: number;
    standardOutstandingBalance: number;
    alterationBillOutstandingBalance: number;
  }>;
  customerBreakdown: Array<{
    data: Array<{
      customerId: string;
      customerName: string | null;
      orderCount: number;
      orderValue: number;
      currentPaidAmount: number;
      currentOutstandingBalance: number;
      standardOrderCount: number;
      alterationBillCount: number;
      standardOrderValue: number;
      alterationBillValue: number;
      standardPaidAmount: number;
      alterationBillPaidAmount: number;
      standardOutstandingBalance: number;
      alterationBillOutstandingBalance: number;
      latestOrderCreatedAt: Date;
    }>;
    meta: Array<{ total: number }>;
  }>;
}

interface FabricSalesReportAggregation {
  summary: Array<{
    saleCount: number;
    meterQuantity: number;
    pieceQuantity: number;
    salesAmount: number;
    distinctFabricCount: number;
  }>;
  fabricBreakdown: Array<{
    data: FabricSalesReport['fabricBreakdown']['data'];
    meta: Array<{ total: number }>;
  }>;
}

interface ServiceUsageReportAggregation {
  summary: Array<{
    serviceLineCount: number;
    distinctServiceCount: number;
    serviceAmount: number;
  }>;
  serviceBreakdown: Array<{
    data: ServiceUsageReport['serviceBreakdown']['data'];
    meta: Array<{ total: number }>;
  }>;
}

@Injectable()
export class ReportsService {
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

  async getCustomerReport(query: CustomerReportQueryDto): Promise<CustomerReport> {
    const activityCounts = await this.customerModel
      .aggregate<GroupedCount<boolean>>([
        ...this.buildDateMatchStages('createdAt', query),
        ...(query.customerId ? [{ $match: { customerId: query.customerId } }] : []),
        { $group: { _id: '$isActive', count: { $sum: 1 } } },
      ])
      .exec();
    const activity = this.toActivityCounts(activityCounts);
    const totalCustomers = activity.active + activity.inactive;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const [aggregation] = await this.orderModel
      .aggregate<CustomerReportAggregation>([
        {
          $facet: {
            commercialSummary: [
              ...this.buildCustomerOrderMatchStages(query),
              {
                $group: {
                  _id: '$customerId',
                  orderCount: { $sum: 1 },
                  orderValue: { $sum: '$totalAmount' },
                  currentPaidAmount: { $sum: '$paidAmount' },
                  currentOutstandingBalance: { $sum: '$balanceAmount' },
                  standardOrderCount: {
                    $sum: {
                      $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, 1, 0],
                    },
                  },
                  alterationBillCount: {
                    $sum: { $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, 1, 0] },
                  },
                  standardOrderValue: {
                    $sum: {
                      $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, '$totalAmount', 0],
                    },
                  },
                  alterationBillValue: {
                    $sum: {
                      $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, '$totalAmount', 0],
                    },
                  },
                  standardPaidAmount: {
                    $sum: {
                      $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, '$paidAmount', 0],
                    },
                  },
                  alterationBillPaidAmount: {
                    $sum: {
                      $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, '$paidAmount', 0],
                    },
                  },
                  standardOutstandingBalance: {
                    $sum: {
                      $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, '$balanceAmount', 0],
                    },
                  },
                  alterationBillOutstandingBalance: {
                    $sum: {
                      $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, '$balanceAmount', 0],
                    },
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  customerOrderCount: { $sum: 1 },
                  repeatCustomerCount: {
                    $sum: { $cond: [{ $gte: ['$orderCount', 2] }, 1, 0] },
                  },
                  orderValue: { $sum: '$orderValue' },
                  currentPaidAmount: { $sum: '$currentPaidAmount' },
                  currentOutstandingBalance: { $sum: '$currentOutstandingBalance' },
                  standardOrderCount: { $sum: '$standardOrderCount' },
                  alterationBillCount: { $sum: '$alterationBillCount' },
                  standardOrderValue: { $sum: '$standardOrderValue' },
                  alterationBillValue: { $sum: '$alterationBillValue' },
                  standardPaidAmount: { $sum: '$standardPaidAmount' },
                  alterationBillPaidAmount: { $sum: '$alterationBillPaidAmount' },
                  standardOutstandingBalance: { $sum: '$standardOutstandingBalance' },
                  alterationBillOutstandingBalance: {
                    $sum: '$alterationBillOutstandingBalance',
                  },
                },
              },
            ],
            customerBreakdown: [
              ...this.buildCustomerOrderMatchStages(query),
              {
                $group: {
                  _id: '$customerId',
                  orderCount: { $sum: 1 },
                  orderValue: { $sum: '$totalAmount' },
                  currentPaidAmount: { $sum: '$paidAmount' },
                  currentOutstandingBalance: { $sum: '$balanceAmount' },
                  standardOrderCount: {
                    $sum: { $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, 1, 0] },
                  },
                  alterationBillCount: {
                    $sum: { $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, 1, 0] },
                  },
                  standardOrderValue: {
                    $sum: {
                      $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, '$totalAmount', 0],
                    },
                  },
                  alterationBillValue: {
                    $sum: {
                      $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, '$totalAmount', 0],
                    },
                  },
                  standardPaidAmount: {
                    $sum: {
                      $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, '$paidAmount', 0],
                    },
                  },
                  alterationBillPaidAmount: {
                    $sum: {
                      $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, '$paidAmount', 0],
                    },
                  },
                  standardOutstandingBalance: {
                    $sum: {
                      $cond: [{ $ne: ['$orderType', OrderType.ALTERATION] }, '$balanceAmount', 0],
                    },
                  },
                  alterationBillOutstandingBalance: {
                    $sum: {
                      $cond: [{ $eq: ['$orderType', OrderType.ALTERATION] }, '$balanceAmount', 0],
                    },
                  },
                  latestOrderCreatedAt: { $max: '$createdAt' },
                },
              },
              {
                $lookup: {
                  from: 'customers',
                  localField: '_id',
                  foreignField: 'customerId',
                  as: 'customer',
                },
              },
              {
                $project: {
                  _id: 0,
                  customerId: '$_id',
                  customerName: { $ifNull: [{ $arrayElemAt: ['$customer.name', 0] }, null] },
                  orderCount: 1,
                  orderValue: 1,
                  currentPaidAmount: 1,
                  currentOutstandingBalance: 1,
                  standardOrderCount: 1,
                  alterationBillCount: 1,
                  standardOrderValue: 1,
                  alterationBillValue: 1,
                  standardPaidAmount: 1,
                  alterationBillPaidAmount: 1,
                  standardOutstandingBalance: 1,
                  alterationBillOutstandingBalance: 1,
                  latestOrderCreatedAt: 1,
                },
              },
              { $sort: { orderValue: -1, customerId: 1 } },
              {
                $facet: {
                  data: [{ $skip: skip }, { $limit: limit }],
                  meta: [{ $count: 'total' }],
                },
              },
            ],
          },
        },
      ] as PipelineStage[])
      .exec();

    const commercialSummary = aggregation?.commercialSummary[0];
    const breakdown = aggregation?.customerBreakdown[0];
    const total = breakdown?.meta[0]?.total ?? 0;

    return {
      totalCustomers,
      activeCustomers: activity.active,
      inactiveCustomers: activity.inactive,
      registrationCount: totalCustomers,
      customerOrderCount: commercialSummary?.customerOrderCount ?? 0,
      repeatCustomerCount: commercialSummary?.repeatCustomerCount ?? 0,
      orderValue: commercialSummary?.orderValue ?? 0,
      currentPaidAmount: commercialSummary?.currentPaidAmount ?? 0,
      currentOutstandingBalance: commercialSummary?.currentOutstandingBalance ?? 0,
      standardOrderCount: commercialSummary?.standardOrderCount ?? 0,
      alterationBillCount: commercialSummary?.alterationBillCount ?? 0,
      standardOrderValue: commercialSummary?.standardOrderValue ?? 0,
      alterationBillValue: commercialSummary?.alterationBillValue ?? 0,
      standardPaidAmount: commercialSummary?.standardPaidAmount ?? 0,
      alterationBillPaidAmount: commercialSummary?.alterationBillPaidAmount ?? 0,
      standardOutstandingBalance: commercialSummary?.standardOutstandingBalance ?? 0,
      alterationBillOutstandingBalance: commercialSummary?.alterationBillOutstandingBalance ?? 0,
      customerBreakdown: {
        data: breakdown?.data ?? [],
        meta: {
          page,
          limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    };
  }

  async getOrderReport(query: OrderReportQueryDto): Promise<OrderReport> {
    const [aggregation] = await this.orderModel
      .aggregate<OrderReportAggregation>([
        {
          $facet: {
            statusCounts: [
              ...this.buildOrderMatchStages(query),
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
            financial: [
              ...this.buildOrderMatchStages(query),
              {
                $group: {
                  _id: null,
                  orderCount: { $sum: 1 },
                  orderValue: { $sum: '$totalAmount' },
                  paidAmount: { $sum: '$paidAmount' },
                  outstandingBalance: { $sum: '$balanceAmount' },
                },
              },
            ],
            classificationFinancial: [
              ...this.buildOrderMatchStages(query),
              {
                $group: {
                  _id: { $ifNull: ['$orderType', OrderType.STANDARD] },
                  orderCount: { $sum: 1 },
                  orderValue: { $sum: '$totalAmount' },
                  paidAmount: { $sum: '$paidAmount' },
                  outstandingBalance: { $sum: '$balanceAmount' },
                },
              },
            ],
            composition: [
              ...this.buildOrderMatchStages(query),
              { $match: { orderType: { $ne: OrderType.ALTERATION } } },
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
                  _id: '$_id',
                  hasTailoring: {
                    $max: {
                      $cond: [{ $ne: ['$items.itemType', 'FABRIC_SALE'] }, 1, 0],
                    },
                  },
                  hasFabricSale: {
                    $max: {
                      $cond: [{ $eq: ['$items.itemType', 'FABRIC_SALE'] }, 1, 0],
                    },
                  },
                  tailoringAmount: {
                    $sum: {
                      $cond: [
                        { $ne: ['$items.itemType', 'FABRIC_SALE'] },
                        { $multiply: ['$items.unitPrice', '$items.quantity'] },
                        0,
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
                  _id: {
                    $switch: {
                      branches: [
                        {
                          case: {
                            $and: [{ $eq: ['$hasTailoring', 1] }, { $eq: ['$hasFabricSale', 0] }],
                          },
                          then: 'TAILORING_ONLY',
                        },
                        {
                          case: {
                            $and: [{ $eq: ['$hasTailoring', 0] }, { $eq: ['$hasFabricSale', 1] }],
                          },
                          then: 'FABRIC_SALE_ONLY',
                        },
                      ],
                      default: 'MIXED',
                    },
                  },
                  tailoringAmount: { $round: ['$tailoringAmount', 2] },
                  attachedFabricAmount: { $round: ['$attachedFabricAmount', 2] },
                  fabricSaleAmount: { $round: ['$fabricSaleAmount', 2] },
                },
              },
              {
                $group: {
                  _id: '$_id',
                  orderCount: { $sum: 1 },
                  tailoringAmount: { $sum: '$tailoringAmount' },
                  attachedFabricAmount: { $sum: '$attachedFabricAmount' },
                  fabricSaleAmount: { $sum: '$fabricSaleAmount' },
                },
              },
            ],
          },
        },
      ])
      .exec();
    const ordersByStatus: Record<OrderStatus, number> = {
      [OrderStatus.DRAFT]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.IN_PROGRESS]: 0,
      [OrderStatus.READY]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
    };

    for (const result of aggregation?.statusCounts ?? []) {
      ordersByStatus[result._id] = result.count;
    }

    const financial = aggregation?.financial[0];
    const classification = {
      [OrderType.STANDARD]: {
        orderCount: 0,
        orderValue: 0,
        paidAmount: 0,
        outstandingBalance: 0,
      },
      [OrderType.ALTERATION]: {
        orderCount: 0,
        orderValue: 0,
        paidAmount: 0,
        outstandingBalance: 0,
      },
    };
    for (const result of aggregation?.classificationFinancial ?? []) {
      classification[result._id] = {
        orderCount: result.orderCount,
        orderValue: result.orderValue,
        paidAmount: result.paidAmount,
        outstandingBalance: result.outstandingBalance,
      };
    }
    const composition = {
      tailoringOnly: 0,
      fabricSaleOnly: 0,
      mixed: 0,
      amounts: {
        tailoringAmount: 0,
        attachedFabricAmount: 0,
        fabricSaleAmount: 0,
      },
    };

    for (const result of aggregation?.composition ?? []) {
      if (result._id === 'TAILORING_ONLY') composition.tailoringOnly = result.orderCount;
      if (result._id === 'FABRIC_SALE_ONLY') composition.fabricSaleOnly = result.orderCount;
      if (result._id === 'MIXED') composition.mixed = result.orderCount;
      composition.amounts.tailoringAmount += result.tailoringAmount;
      composition.amounts.attachedFabricAmount += result.attachedFabricAmount;
      composition.amounts.fabricSaleAmount += result.fabricSaleAmount;
    }

    return {
      totalOrders: Object.values(ordersByStatus).reduce((total, count) => total + count, 0),
      ordersByStatus,
      orderTotals: {
        pending: ordersByStatus.DRAFT + ordersByStatus.CONFIRMED,
        inProgress: ordersByStatus.IN_PROGRESS + ordersByStatus.READY,
        completed: ordersByStatus.DELIVERED,
        cancelled: ordersByStatus.CANCELLED,
      },
      orderCount: financial?.orderCount ?? 0,
      orderValue: financial?.orderValue ?? 0,
      paidAmount: financial?.paidAmount ?? 0,
      outstandingBalance: financial?.outstandingBalance ?? 0,
      classification,
      composition,
    };
  }

  private buildOrderMatchStages(query: OrderReportQueryDto): PipelineStage.Match[] {
    const stages = this.buildDateMatchStages('createdAt', query);

    if (query.customerId) {
      stages.push({ $match: { customerId: query.customerId } });
    }

    return stages;
  }

  private buildCustomerOrderMatchStages(query: CustomerReportQueryDto): PipelineStage.Match[] {
    const stages = this.buildDateMatchStages('createdAt', query);

    if (query.customerId) {
      stages.push({ $match: { customerId: query.customerId } });
    }

    return stages;
  }

  async getPaymentReport(query: PaymentReportQueryDto): Promise<PaymentReport> {
    const [aggregation] = await this.paymentModel
      .aggregate<PaymentReportAggregation>([
        {
          $facet: {
            grossCollections: [
              {
                $match: {
                  ...this.buildPaymentFilter(query, 'paidAt'),
                  status: { $in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
                },
              },
              { $group: { _id: null, total: { $sum: '$amount' } } },
            ],
            refunds: [
              {
                $match: {
                  ...this.buildPaymentFilter(query, 'refundedAt'),
                  status: PaymentStatus.REFUNDED,
                },
              },
              { $group: { _id: null, total: { $sum: '$amount' } } },
            ],
            byStatus: [
              { $match: this.buildPaymentFilter(query, 'paidAt') },
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
            byMethod: [
              { $match: this.buildPaymentFilter(query, 'paidAt') },
              { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
            ],
            byOrderTypeCollections: [
              {
                $match: {
                  ...this.buildPaymentFilter(query, 'paidAt'),
                  status: { $in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
                },
              },
              {
                $lookup: {
                  from: 'orders',
                  localField: 'orderId',
                  foreignField: 'orderId',
                  as: 'order',
                },
              },
              { $unwind: '$order' },
              {
                $group: {
                  _id: { $ifNull: ['$order.orderType', OrderType.STANDARD] },
                  total: { $sum: '$amount' },
                },
              },
            ],
            byOrderTypeRefunds: [
              {
                $match: {
                  ...this.buildPaymentFilter(query, 'refundedAt'),
                  status: PaymentStatus.REFUNDED,
                },
              },
              {
                $lookup: {
                  from: 'orders',
                  localField: 'orderId',
                  foreignField: 'orderId',
                  as: 'order',
                },
              },
              { $unwind: '$order' },
              {
                $group: {
                  _id: { $ifNull: ['$order.orderType', OrderType.STANDARD] },
                  total: { $sum: '$amount' },
                },
              },
            ],
          },
        },
      ])
      .exec();

    const byStatus: Record<PaymentStatus, number> = {
      [PaymentStatus.PENDING]: 0,
      [PaymentStatus.SUCCESS]: 0,
      [PaymentStatus.FAILED]: 0,
      [PaymentStatus.REFUNDED]: 0,
    };
    for (const result of aggregation?.byStatus ?? []) {
      byStatus[result._id] = result.count;
    }

    const byMethod: Record<PaymentMethod, number> = {
      [PaymentMethod.CASH]: 0,
      [PaymentMethod.CARD]: 0,
      [PaymentMethod.UPI]: 0,
      [PaymentMethod.BANK_TRANSFER]: 0,
      [PaymentMethod.OTHER]: 0,
    };
    for (const result of aggregation?.byMethod ?? []) {
      byMethod[result._id] = result.count;
    }

    const byOrderType: PaymentReport['byOrderType'] = {
      [OrderType.STANDARD]: { grossCollections: 0, refunds: 0 },
      [OrderType.ALTERATION]: { grossCollections: 0, refunds: 0 },
    };
    for (const result of aggregation?.byOrderTypeCollections ?? []) {
      byOrderType[result._id].grossCollections = result.total;
    }
    for (const result of aggregation?.byOrderTypeRefunds ?? []) {
      byOrderType[result._id].refunds = result.total;
    }

    const grossCollections = aggregation?.grossCollections[0]?.total ?? 0;
    const refunds = aggregation?.refunds[0]?.total ?? 0;

    return {
      grossCollections,
      refunds,
      netCollections: Number((grossCollections - refunds).toFixed(2)),
      paymentCounts: { byStatus, byMethod },
      byOrderType,
    };
  }

  private buildPaymentFilter(
    query: PaymentReportQueryDto,
    dateField: 'paidAt' | 'refundedAt',
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (query.customerId) {
      filter.customerId = query.customerId;
    }

    if (query.paymentMethod) {
      filter.paymentMethod = query.paymentMethod;
    }

    if (query.fromDate || query.toDate) {
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

      filter[dateField] = range;
    }

    return filter;
  }

  async getAppointmentReport(query: ReportDateQueryDto): Promise<AppointmentReport> {
    const [aggregation] = await this.appointmentModel
      .aggregate<AppointmentReportAggregation>([
        ...this.buildDateMatchStages('appointmentDate', query),
        {
          $facet: {
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          },
        },
      ])
      .exec();
    const appointmentsByStatus: Record<AppointmentStatus, number> = {
      [AppointmentStatus.SCHEDULED]: 0,
      [AppointmentStatus.CONFIRMED]: 0,
      [AppointmentStatus.COMPLETED]: 0,
      [AppointmentStatus.CANCELLED]: 0,
      [AppointmentStatus.NO_SHOW]: 0,
    };
    const appointmentsByType: Record<AppointmentType, number> = {
      [AppointmentType.CONSULTATION]: 0,
      [AppointmentType.MEASUREMENT]: 0,
      [AppointmentType.FITTING]: 0,
      [AppointmentType.TRIAL]: 0,
      [AppointmentType.PICKUP]: 0,
    };

    for (const result of aggregation?.byStatus ?? []) {
      appointmentsByStatus[result._id] = result.count;
    }

    for (const result of aggregation?.byType ?? []) {
      appointmentsByType[result._id] = result.count;
    }

    return {
      totalAppointments: Object.values(appointmentsByStatus).reduce(
        (total, count) => total + count,
        0,
      ),
      appointmentsByStatus,
      appointmentsByType,
    };
  }

  async getFabricReport(query: ReportDateQueryDto): Promise<FabricReport> {
    const lowStockThreshold = this.configService.get<number>('app.fabricLowStockThreshold', 5);
    const [aggregation] = await this.fabricModel
      .aggregate<FabricReportAggregation>([
        ...this.buildDateMatchStages('createdAt', query),
        {
          $facet: {
            activity: [{ $group: { _id: '$isActive', count: { $sum: 1 } } }],
            lowStock: [
              {
                $match: {
                  isActive: true,
                  quantity: { $lte: lowStockThreshold },
                },
              },
              { $count: 'count' },
            ],
            availableQuantityByUnit: [
              { $match: { isActive: true } },
              { $group: { _id: '$unit', total: { $sum: '$quantity' } } },
            ],
          },
        },
      ])
      .exec();
    const activity = this.toActivityCounts(aggregation?.activity ?? []);
    const availableQuantityByUnit: Record<QuantityUnit, number> = {
      [QuantityUnit.METER]: 0,
      [QuantityUnit.PIECE]: 0,
    };

    for (const result of aggregation?.availableQuantityByUnit ?? []) {
      availableQuantityByUnit[result._id] = result.total;
    }

    const quantityGroups = aggregation?.availableQuantityByUnit ?? [];
    const totalAvailableQuantity =
      quantityGroups.length > 1 ? null : (quantityGroups[0]?.total ?? 0);

    return {
      totalFabrics: activity.active + activity.inactive,
      activeFabrics: activity.active,
      inactiveFabrics: activity.inactive,
      lowStockFabrics: {
        count: aggregation?.lowStock[0]?.count ?? 0,
        threshold: lowStockThreshold,
      },
      totalAvailableQuantity,
      availableQuantityByUnit,
    };
  }

  async getFabricSalesReport(query: FabricSalesReportQueryDto): Promise<FabricSalesReport> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const [aggregation] = await this.orderModel
      .aggregate<FabricSalesReportAggregation>([
        ...this.buildDateMatchStages('createdAt', query),
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
          $match: {
            'items.itemType': 'FABRIC_SALE',
            ...(query.fabricId ? { 'items.fabricSaleSnapshot.fabricId': query.fabricId } : {}),
          },
        },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  saleCount: { $sum: 1 },
                  meterQuantity: {
                    $sum: {
                      $cond: [
                        { $eq: ['$items.fabricSaleSnapshot.unit', QuantityUnit.METER] },
                        { $ifNull: ['$items.fabricSaleSnapshot.quantitySold', 0] },
                        0,
                      ],
                    },
                  },
                  pieceQuantity: {
                    $sum: {
                      $cond: [
                        { $eq: ['$items.fabricSaleSnapshot.unit', QuantityUnit.PIECE] },
                        { $ifNull: ['$items.fabricSaleSnapshot.quantitySold', 0] },
                        0,
                      ],
                    },
                  },
                  salesAmount: {
                    $sum: { $ifNull: ['$items.fabricSaleSnapshot.lineTotal', 0] },
                  },
                  distinctFabricIds: {
                    $addToSet: { $ifNull: ['$items.fabricSaleSnapshot.fabricId', null] },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  saleCount: 1,
                  meterQuantity: 1,
                  pieceQuantity: 1,
                  salesAmount: 1,
                  distinctFabricCount: {
                    $size: {
                      $filter: {
                        input: '$distinctFabricIds',
                        as: 'fabricId',
                        cond: { $ne: ['$$fabricId', null] },
                      },
                    },
                  },
                },
              },
            ],
            fabricBreakdown: [
              { $match: { 'items.fabricSaleSnapshot.fabricId': { $exists: true } } },
              {
                $group: {
                  _id: '$items.fabricSaleSnapshot.fabricId',
                  name: { $first: '$items.fabricSaleSnapshot.name' },
                  type: { $first: '$items.fabricSaleSnapshot.type' },
                  color: { $first: '$items.fabricSaleSnapshot.color' },
                  unit: { $first: '$items.fabricSaleSnapshot.unit' },
                  totalQuantitySold: {
                    $sum: { $ifNull: ['$items.fabricSaleSnapshot.quantitySold', 0] },
                  },
                  totalSalesAmount: {
                    $sum: { $ifNull: ['$items.fabricSaleSnapshot.lineTotal', 0] },
                  },
                  saleLineCount: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  fabricId: '$_id',
                  name: { $ifNull: ['$name', null] },
                  type: { $ifNull: ['$type', null] },
                  color: { $ifNull: ['$color', null] },
                  unit: { $ifNull: ['$unit', null] },
                  totalQuantitySold: 1,
                  totalSalesAmount: 1,
                  saleLineCount: 1,
                },
              },
              { $sort: { totalSalesAmount: -1, fabricId: 1 } },
              {
                $facet: {
                  data: [{ $skip: skip }, { $limit: limit }],
                  meta: [{ $count: 'total' }],
                },
              },
            ],
          },
        },
      ] as PipelineStage[])
      .exec();

    const summary = aggregation?.summary[0];
    const breakdown = aggregation?.fabricBreakdown[0];
    const total = breakdown?.meta[0]?.total ?? 0;

    return {
      saleCount: summary?.saleCount ?? 0,
      quantitySoldByUnit: {
        [QuantityUnit.METER]: summary?.meterQuantity ?? 0,
        [QuantityUnit.PIECE]: summary?.pieceQuantity ?? 0,
      },
      salesAmount: summary?.salesAmount ?? 0,
      distinctFabricCount: summary?.distinctFabricCount ?? 0,
      fabricBreakdown: {
        data: breakdown?.data ?? [],
        meta: {
          page,
          limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    };
  }

  async getServiceReport(query: ReportDateQueryDto): Promise<ServiceReport> {
    const [aggregation] = await this.tailoringServiceModel
      .aggregate<ServiceReportAggregation>([
        ...this.buildDateMatchStages('createdAt', query),
        {
          $facet: {
            activity: [{ $group: { _id: '$isActive', count: { $sum: 1 } } }],
            byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
          },
        },
      ])
      .exec();
    const activity = this.toActivityCounts(aggregation?.activity ?? []);
    const servicesByCategory: Record<ServiceCategory, number> = {
      [ServiceCategory.STITCHING]: 0,
      [ServiceCategory.ALTERATION]: 0,
      [ServiceCategory.CUSTOM_TAILORING]: 0,
      [ServiceCategory.REPAIR]: 0,
      [ServiceCategory.OTHER]: 0,
    };

    for (const result of aggregation?.byCategory ?? []) {
      servicesByCategory[result._id] = result.count;
    }

    return {
      totalServices: activity.active + activity.inactive,
      activeServices: activity.active,
      inactiveServices: activity.inactive,
      servicesByCategory,
    };
  }

  async getServiceUsageReport(query: ServiceUsageReportQueryDto): Promise<ServiceUsageReport> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const [aggregation] = await this.orderModel
      .aggregate<ServiceUsageReportAggregation>([
        ...this.buildDateMatchStages('createdAt', query),
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
          $match: {
            'items.itemType': { $ne: 'FABRIC_SALE' },
            'items.serviceSnapshot.serviceId': { $exists: true },
            ...(query.serviceId ? { 'items.serviceSnapshot.serviceId': query.serviceId } : {}),
          },
        },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  serviceLineCount: { $sum: 1 },
                  distinctServiceIds: { $addToSet: '$items.serviceSnapshot.serviceId' },
                  serviceAmount: {
                    $sum: { $ifNull: ['$items.serviceSnapshot.lineAmount', 0] },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  serviceLineCount: 1,
                  distinctServiceCount: { $size: '$distinctServiceIds' },
                  serviceAmount: 1,
                },
              },
            ],
            serviceBreakdown: [
              {
                $group: {
                  _id: '$items.serviceSnapshot.serviceId',
                  name: { $first: '$items.serviceSnapshot.name' },
                  totalQuantity: {
                    $sum: { $ifNull: ['$items.serviceSnapshot.quantity', 0] },
                  },
                  lineCount: { $sum: 1 },
                  serviceAmount: {
                    $sum: { $ifNull: ['$items.serviceSnapshot.lineAmount', 0] },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  serviceId: '$_id',
                  name: { $ifNull: ['$name', null] },
                  totalQuantity: 1,
                  lineCount: 1,
                  serviceAmount: 1,
                },
              },
              { $sort: { serviceAmount: -1, serviceId: 1 } },
              {
                $facet: {
                  data: [{ $skip: skip }, { $limit: limit }],
                  meta: [{ $count: 'total' }],
                },
              },
            ],
          },
        },
      ] as PipelineStage[])
      .exec();

    const summary = aggregation?.summary[0];
    const breakdown = aggregation?.serviceBreakdown[0];
    const total = breakdown?.meta[0]?.total ?? 0;

    return {
      serviceLineCount: summary?.serviceLineCount ?? 0,
      distinctServiceCount: summary?.distinctServiceCount ?? 0,
      serviceAmount: summary?.serviceAmount ?? 0,
      serviceBreakdown: {
        data: breakdown?.data ?? [],
        meta: {
          page,
          limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
    };
  }

  private toActivityCounts(results: GroupedCount<boolean>[]) {
    const activity = { active: 0, inactive: 0 };

    for (const result of results) {
      activity[result._id ? 'active' : 'inactive'] = result.count;
    }

    return activity;
  }

  private buildDateMatchStages(
    field: 'createdAt' | 'appointmentDate',
    query: ReportDateQueryDto,
  ): PipelineStage.Match[] {
    if (!query.fromDate && !query.toDate) {
      return [];
    }

    const range: { $gte?: Date; $lt?: Date } = {};

    if (query.fromDate) {
      range.$gte = parseReportDate(query.fromDate);
    }

    if (query.toDate) {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(query.toDate);
      const exclusiveUpperBoundary = parseReportDate(query.toDate);

      if (isDateOnly) {
        exclusiveUpperBoundary.setUTCDate(exclusiveUpperBoundary.getUTCDate() + 1);
      } else {
        exclusiveUpperBoundary.setTime(exclusiveUpperBoundary.getTime() + 1);
      }

      range.$lt = exclusiveUpperBoundary;
    }

    return [{ $match: { [field]: range } }];
  }
}
