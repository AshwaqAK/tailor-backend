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
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { ServiceCategory } from '../services/enums/service-category.enum';
import {
  TailoringService,
  TailoringServiceDocument,
} from '../services/schemas/tailoring-service.schema';
import { parseReportDate, ReportDateQueryDto } from './dto/report-date-query.dto';
import {
  AppointmentReport,
  CustomerReport,
  FabricReport,
  OrderReport,
  ServiceReport,
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

@Injectable()
export class ReportsService {
  constructor(
    private readonly configService: ConfigService,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,

    @InjectModel(Fabric.name)
    private readonly fabricModel: Model<FabricDocument>,

    @InjectModel(TailoringService.name)
    private readonly tailoringServiceModel: Model<TailoringServiceDocument>,
  ) {}

  async getCustomerReport(query: ReportDateQueryDto): Promise<CustomerReport> {
    const activityCounts = await this.customerModel
      .aggregate<GroupedCount<boolean>>([
        ...this.buildDateMatchStages('createdAt', query),
        { $group: { _id: '$isActive', count: { $sum: 1 } } },
      ])
      .exec();
    const activity = this.toActivityCounts(activityCounts);
    const totalCustomers = activity.active + activity.inactive;

    return {
      totalCustomers,
      activeCustomers: activity.active,
      inactiveCustomers: activity.inactive,
      registrationCount: totalCustomers,
    };
  }

  async getOrderReport(query: ReportDateQueryDto): Promise<OrderReport> {
    const statusCounts = await this.orderModel
      .aggregate<GroupedCount<OrderStatus>>([
        ...this.buildDateMatchStages('createdAt', query),
        { $group: { _id: '$status', count: { $sum: 1 } } },
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

    for (const result of statusCounts) {
      ordersByStatus[result._id] = result.count;
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
    };
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
  ): PipelineStage[] {
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
