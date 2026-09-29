import { AppointmentStatus } from '../../appointments/enums/appointment-status.enum';
import { OrderStatus } from '../../orders/enums/order-status.enum';

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
}
