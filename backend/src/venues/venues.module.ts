import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Venue } from './entities/venue.entity';
import { VenueSection } from './entities/venue-section.entity';
import { Seat } from './entities/seat.entity';
import { IotSensor } from './entities/iot-sensor.entity';
import { VenueCapacitySnapshot } from './entities/venue-capacity-snapshot.entity';

import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { IotCapacityService } from './iot-capacity.service';
import { IotCapacityController } from './iot-capacity.controller';
import { VenueCapacityService } from './venue-capacity.service';
import { VenueCapacityController } from './venue-capacity.controller';

import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venue,
      VenueSection,
      Seat,
      IotSensor,
      VenueCapacitySnapshot,
      TicketEntity,
      Event,
    ]),
    EventsModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [VenuesController, IotCapacityController, VenueCapacityController],
  providers: [VenuesService, IotCapacityService, VenueCapacityService],
  exports: [VenuesService, IotCapacityService, VenueCapacityService],
})
export class VenuesModule {}
