import { AppointmentStatus } from '../../appointments/enums/appointment-status.enum';
import { AppointmentType } from '../../appointments/enums/appointment-type.enum';
import { QuantityUnit } from '../../fabrics/enums/quantity-unit.enum';
import { OrderStatus } from '../../orders/enums/order-status.enum';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import { ServiceCategory } from '../../services/enums/service-category.enum';

export interface CustomerReport {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  registrationCount: number;
  customerOrderCount: number;
  repeatCustomerCount: number;
  orderValue: number;
  currentPaidAmount: number;
  currentOutstandingBalance: number;
  customerBreakdown: {
    data: Array<{
      customerId: string;
      customerName: string | null;
      orderCount: number;
      orderValue: number;
      currentPaidAmount: number;
      currentOutstandingBalance: number;
      latestOrderCreatedAt: Date;
    }>;
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
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
  orderCount: number;
  orderValue: number;
  paidAmount: number;
  outstandingBalance: number;
  composition: {
    tailoringOnly: number;
    fabricSaleOnly: number;
    mixed: number;
    amounts: {
      tailoringAmount: number;
      attachedFabricAmount: number;
      fabricSaleAmount: number;
    };
  };
}

export interface PaymentReport {
  grossCollections: number;
  refunds: number;
  netCollections: number;
  paymentCounts: {
    byStatus: Record<PaymentStatus, number>;
    byMethod: Record<PaymentMethod, number>;
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
  totalAvailableQuantity: number | null;
  availableQuantityByUnit: Record<QuantityUnit, number>;
}

export interface FabricSalesReport {
  saleCount: number;
  quantitySoldByUnit: Record<QuantityUnit, number>;
  salesAmount: number;
  distinctFabricCount: number;
  fabricBreakdown: {
    data: Array<{
      fabricId: string;
      name: string | null;
      type: string | null;
      color: string | null;
      unit: QuantityUnit | null;
      totalQuantitySold: number;
      totalSalesAmount: number;
      saleLineCount: number;
    }>;
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface ServiceReport {
  totalServices: number;
  activeServices: number;
  inactiveServices: number;
  servicesByCategory: Record<ServiceCategory, number>;
}

export interface ServiceUsageReport {
  serviceLineCount: number;
  distinctServiceCount: number;
  serviceAmount: number;
  serviceBreakdown: {
    data: Array<{
      serviceId: string;
      name: string | null;
      totalQuantity: number;
      lineCount: number;
      serviceAmount: number;
    }>;
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}
