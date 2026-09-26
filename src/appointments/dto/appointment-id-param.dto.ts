import { IsString, Matches } from 'class-validator';

export class AppointmentIdParamDto {
  @IsString()
  @Matches(/^APT-\d{6}$/, {
    message: 'appointmentId must be a valid appointment ID',
  })
  appointmentId!: string;
}
