import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppointmentStatus } from '../appointments/enums/appointment-status.enum';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Fabric, FabricDocument } from '../fabrics/schemas/fabric.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  TailoringService,
  TailoringServiceDocument,
} from '../services/schemas/tailoring-service.schema';
import { DashboardSummary } from './types/dashboard-summary.type';

interface GroupedCount<T> {
  _id: T;
  count: number;
}

@Injectable()
export class DashboardService {
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

  async getSummary(): Promise<DashboardSummary> {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const lowStockThreshold = this.configService.get<number>(
      'app.fabricLowStockThreshold',
      5,
    );

    const [
      customerActivityCounts,
      orderStatusCounts,
      appointmentStatusCounts,
      upcomingAppointments,
      fabricActivityCounts,
      lowStockFabricCount,
      tailoringServiceActivityCounts,
    ] = await Promise.all([
      this.customerModel
        .aggregate<GroupedCount<boolean>>([
          { $group: { _id: '$isActive', count: { $sum: 1 } } },
        ])
        .exec(),
      this.orderModel
        .aggregate<GroupedCount<OrderStatus>>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
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
        .aggregate<GroupedCount<boolean>>([
          { $group: { _id: '$isActive', count: { $sum: 1 } } },
        ])
        .exec(),
      this.fabricModel
        .countDocuments({
          isActive: true,
          quantity: { $lte: lowStockThreshold },
        })
        .exec(),
      this.tailoringServiceModel
        .aggregate<GroupedCount<boolean>>([
          { $group: { _id: '$isActive', count: { $sum: 1 } } },
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
    for (const result of orderStatusCounts) {
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

    const totalCustomers = customersByActivity.active + customersByActivity.inactive;
    const totalOrders = Object.values(ordersByStatus).reduce(
      (total, count) => total + count,
      0,
    );
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
    };
  }
}
