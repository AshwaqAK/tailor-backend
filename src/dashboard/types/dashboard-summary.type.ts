import { AppointmentStatus } from '../../appointments/enums/appointment-status.enum';
import { QuantityUnit } from '../../fabrics/enums/quantity-unit.enum';
import { OrderStatus } from '../../orders/enums/order-status.enum';
import { OrderType } from '../../orders/enums/order-type.enum';

export interface ActivityBreakdown {
  active: number;
  inactive: number;
}

export interface DashboardSummary {
  totalCustomers: number;
  activeCustomers: number;
  totalOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  completedOrders: number;
  totalAppointments: number;
  upcomingAppointments: number;
  totalActiveFabrics: number;
  totalActiveTailoringServices: number;
  ordersByStatus: Record<OrderStatus, number>;
  appointmentsByStatus: Record<AppointmentStatus, number>;
  customersByActivity: ActivityBreakdown;
  fabricsByActivity: ActivityBreakdown;
  tailoringServicesByActivity: ActivityBreakdown;
  lowStockFabrics: {
    count: number;
    threshold: number;
  };
  ordersToday: number;
  standardOrdersToday: number;
  alterationBillsToday: number;
  orderValue: number;
  standardOrderValue: number;
  alterationBillValue: number;
  outstanding: {
    total: number;
    orderCount: number;
    standardTotal: number;
    alterationBillTotal: number;
  };
  recentOrders: RecentOrder[];
  revenue: {
    collected: number;
  };
  fabricStock: {
    activeFabricCount: number;
    inactiveFabricCount: number;
    availableQuantityByUnit: Record<QuantityUnit, number>;
    lowStock: {
      count: number;
      threshold: number;
    };
  };
  salesMix: {
    tailoringAmount: number;
    attachedFabricAmount: number;
    fabricSaleAmount: number;
    standardOrderValue: number;
    alterationBillAmount: number;
    totalOrderValue: number;
  };
}

export interface RecentOrder {
  orderId: string;
  customerId: string;
  customerName?: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: OrderStatus;
  orderType: OrderType;
  createdAt: Date;
}
