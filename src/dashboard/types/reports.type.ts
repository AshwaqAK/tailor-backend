import { AppointmentStatus } from '../../appointments/enums/appointment-status.enum';
import { AppointmentType } from '../../appointments/enums/appointment-type.enum';
import { QuantityUnit } from '../../fabrics/enums/quantity-unit.enum';
import { OrderStatus } from '../../orders/enums/order-status.enum';
import { ServiceCategory } from '../../services/enums/service-category.enum';

export interface CustomerReport {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  registrationCount: number;
}

export interface OrderReport {
  totalOrders: number;
  ordersByStatus: Record<OrderStatus, number>;
  orderTotals: {
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
}

export interface AppointmentReport {
  totalAppointments: number;
  appointmentsByStatus: Record<AppointmentStatus, number>;
  appointmentsByType: Record<AppointmentType, number>;
}

export interface FabricReport {
  totalFabrics: number;
  activeFabrics: number;
  inactiveFabrics: number;
  lowStockFabrics: {
    count: number;
    threshold: number;
  };
  totalAvailableQuantity: number;
  availableQuantityByUnit: Record<QuantityUnit, number>;
}

export interface ServiceReport {
  totalServices: number;
  activeServices: number;
  inactiveServices: number;
  servicesByCategory: Record<ServiceCategory, number>;
}
