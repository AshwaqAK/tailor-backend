import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type CounterDocument = Counter & {
  _id: string;
};

@Schema({
  versionKey: false,
})
export class Counter {
  @Prop({
    required: true,
    default: 0,
  })
  sequence!: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
