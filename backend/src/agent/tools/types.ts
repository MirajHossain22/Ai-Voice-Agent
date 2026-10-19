export type ToolError = {
  code: string;
  message: string;
};

export type ToolResult<T> =
  { ok: true; data: T } | { ok: false; error: ToolError };

export type ToolContext = {
  callId: string;
};

export type AvailabilitySlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
};

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
};

export type AppointmentRecord = {
  id: string;
  startsAt: Date;
  endsAt: Date;
};

export type ToolRepository = {
  listAvailableSlots: (date: Date) => Promise<AvailabilitySlot[]>;
  findAvailableSlot: (startTime: Date) => Promise<AvailabilitySlot | null>;
  findCustomerByPhone: (phone: string) => Promise<CustomerRecord | null>;
  createAppointment: (input: {
    callId: string;
    customerName: string;
    phone: string;
    slot: AvailabilitySlot;
  }) => Promise<AppointmentRecord>;
  findAppointment: (
    appointmentId: string,
  ) => Promise<{ id: string; callId: string } | null>;
  recordAction: (input: {
    callId: string;
    type: 'confirmation_sent' | 'transferred' | 'appointment_booked';
    status: 'success' | 'failed';
    payloadJson?: Record<string, string>;
  }) => Promise<void>;
};
