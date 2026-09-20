import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type CustomerCounterDocument = CustomerCounter & {
  _id: string;
};

@Schema({
  versionKey: false,
})
export class CustomerCounter {
  @Prop({
    type: String,
    required: true,
  })
  _id!: string;

  @Prop({
    required: true,
    default: 0,
  })
  sequence!: number;
}

export const CustomerCounterSchema = SchemaFactory.createForClass(CustomerCounter);
